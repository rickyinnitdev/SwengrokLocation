import { locations, modes } from '../.generated/game-data.js';
import { drawLocations } from './location-rotation.js';
import { distance, scoreRound } from './scoring.js';
import { poolFor, poolKeyFor } from './pools.js';

export const MAX_PLAYERS = 8;
export const GRACE_MS = 30000;
const ROOM_TTL = 2 * 60 * 60 * 1000;
export const EMOTES = ['🛵 Vroom!', '📍 Easy spot!', '🤔 No clue!', '🔥 Ready!', '👑 GG!'];
const clean = (s, fallback, n = 60) => typeof s === 'string' ? s.replace(/[<>\x00-\x1f]/g, '').trim().slice(0, n) || fallback : fallback;
export function profile(p = {}) {
  // Preserve only small, primitive avatar fields. The client validates their values.
  const avatarConfig = {};
  if (p?.avatarConfig && typeof p.avatarConfig === 'object') {
    for (const [k, v] of Object.entries(p.avatarConfig).slice(0, 16)) {
      if (typeof v === 'string') avatarConfig[clean(k, '', 30)] = clean(v, '', 40);
    }
  }
  return { name: clean(p?.name, 'Explorer', 24), title: clean(p?.title, 'Explorer'), avatarType: 'custom', avatarConfig };
}
export function randomInt(n) {
  // Rejection sampling avoids modulo bias in both shuffles and headings.
  const limit = Math.floor(0x100000000 / n) * n;
  let value;
  do { value = crypto.getRandomValues(new Uint32Array(1))[0]; } while (value >= limit);
  return value % n;
}
export function shuffled(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
export { distance };
export function initialState() {
  return { players: [], hostId: null, mode: 'classic', match: null, teams: [], recent: [], rotation: { history: [] }, updatedAt: 0 };
}
export class RoomEngine {
  constructor(state = initialState()) {
    this.state = state;
    this.state.rotation ||= { history: [...(state.recent || [])] };
    this.state.teams ||= [];
  }
  isTeamsMode() {
    return !!modes[this.state.mode]?.teams;
  }
  connectedIds() {
    return this.state.players.filter(p => p.connected).map(p => p.id);
  }
  teamFor(id) {
    return this.state.teams.find(t => t.playerIds.includes(id));
  }
  autoTeams() {
    // Keep pairs together and give the odd player out a three-person team.
    const ids = this.connectedIds();
    const teams = [];
    let i = 0;
    while (ids.length - i > 3) {
      teams.push({ id: `team_${teams.length + 1}`, playerIds: ids.slice(i, i + 2) });
      i += 2;
    }
    if (i < ids.length) teams.push({ id: `team_${teams.length + 1}`, playerIds: ids.slice(i) });
    this.state.teams = teams;
  }
  validTeams(teams) {
    const connected = this.connectedIds();
    if (!Array.isArray(teams) || !teams.length || connected.length < 2) return false;
    const seen = new Set();
    let triples = 0;
    for (const team of teams) {
      if (!team || !Array.isArray(team.playerIds)) return false;
      if (team.playerIds.length < 2 || team.playerIds.length > 3) return false;
      if (team.playerIds.length === 3) triples++;
      for (const id of team.playerIds) {
        if (!connected.includes(id) || seen.has(id)) return false;
        seen.add(id);
      }
    }
    return triples <= 1 && seen.size === connected.length && connected.every(id => seen.has(id));
  }
  applyTeams(teams) {
    this.state.teams = teams.map((team, index) => ({
      id: `team_${index + 1}`,
      playerIds: [...new Set(team.playerIds)]
    }));
  }
  syncTeams(force = false) {
    if (!this.isTeamsMode()) { this.state.teams = []; return; }
    if (force || !this.validTeams(this.state.teams)) {
      if (this.connectedIds().length) this.autoTeams();
      else this.state.teams = [];
    }
  }
  pruneTeams() {
    const ids = new Set(this.state.players.map(p => p.id));
    this.state.teams = this.state.teams
      .map(team => ({ ...team, playerIds: team.playerIds.filter(id => ids.has(id)) }))
      .filter(team => team.playerIds.length);
  }
  roundRoles() {
    const s = this.state, m = s.match, roles = {};
    for (const team of s.teams) {
      const active = team.playerIds.filter(id => s.players.some(p => p.id === id && p.connected));
      if (!active.length) continue;
      if (active.length === 1) {
        roles[active[0]] = 'both';
      } else {
        const pinner = active[(m.round - 1) % active.length];
        for (const id of active) roles[id] = id === pinner ? 'pinner' : 'viewer';
      }
    }
    return roles;
  }
  teamHasGuess(teamId, round = this.state.match?.round) {
    const team = this.state.teams.find(t => t.id === teamId);
    return !!team?.playerIds.some(id => this.state.match?.guesses?.[round]?.[id]);
  }
  join({ create, token, profile: p, mode, seen }, now = Date.now()) {
    const s = this.state;
    let player = token && s.players.find(p => p.token === token);
    if (!player) {
      if (!s.players.length && !create) throw new Error('Room not found. Check the code with your friend.');
      if (s.players.length && create) throw new Error('ROOM_EXISTS');
      if (s.match && s.match.phase !== 'final') throw new Error('This match has started. Join the next party.');
      if (s.players.length >= MAX_PLAYERS) throw new Error('This party is full (8 players).');
      player = { id: crypto.randomUUID(), token: crypto.randomUUID(), profile: profile(p), connected: true, leftAt: null };
      s.players.push(player);
      const valid = new Set(Object.values(locations).flat().map(l => l.id));
      if (Array.isArray(seen)) {
        const imported = seen.filter(id => typeof id === 'string' && valid.has(id)).slice(-600);
        s.rotation.history = [...new Set([...imported, ...s.rotation.history])].slice(-1500);
        // Imported browser history also applies to an already-created lobby deck.
        for (const key of Object.keys(s.rotation.decks || {})) {
          const remaining = s.rotation.decks[key].filter(id => !imported.includes(id));
          if (remaining.length) s.rotation.decks[key] = remaining;
        }
      }
      if (!s.hostId) { s.hostId = player.id; s.mode = Object.hasOwn(modes, mode) ? mode : 'classic'; }
    }
    player.connected = true;
    player.leftAt = null;
    if (!s.match) player.profile = profile(p);
    if (!s.match) this.syncTeams();
    s.updatedAt = now;
    return player;
  }
  pool() { return poolFor(modes[this.state.mode]); }
  poolKey() { return poolKeyFor(modes[this.state.mode]); }
  makePlan() {
    const s = this.state, count = modes[s.mode].rounds;
    const pool = this.pool();
    const picks = drawLocations(pool, count, s.rotation, this.poolKey());
    s.recent = s.rotation.history;
    return picks.map(l => ({ id: l.id, heading: randomInt(360) }));
  }
  startRound(now) {
    const m = this.state.match;
    m.startedAt = now + 800;
    m.deadline = m.startedAt + modes[this.state.mode].time * 1000;
    m.ready = [];
    if (this.isTeamsMode()) m.roles = this.roundRoles();
  }
  handle(id, msg, now = Date.now()) {
    const s = this.state, p = s.players.find(p => p.id === id);
    if (!p || !p.connected || !msg || typeof msg !== 'object') return;
    s.updatedAt = now;
    if (msg.type === 'UPDATE_PROFILE') {
      if (!s.match) p.profile = profile(msg.profile);
    } else if (msg.type === 'SET_MODE') {
      if (id !== s.hostId || s.match || !Object.hasOwn(modes, msg.mode)) return;
      s.mode = msg.mode;
      this.syncTeams(true);
    } else if (msg.type === 'SET_TEAMS') {
      if (id !== s.hostId || s.match || !this.isTeamsMode() || !this.validTeams(msg.teams)) return;
      this.applyTeams(msg.teams);
    } else if (msg.type === 'START_MATCH') {
      if (id !== s.hostId || s.match || s.players.filter(p => p.connected).length < 2 || s.players.some(p => !p.connected)) return;
      if (this.isTeamsMode() && !this.validTeams(s.teams)) this.syncTeams(true);
      if (this.isTeamsMode() && !this.validTeams(s.teams)) return;
      s.match = { id: crypto.randomUUID(), phase: 'playing', plan: this.makePlan(), round: 1, guesses: {}, ready: [], swaps: 0 };
      this.startRound(now);
    } else if (msg.type === 'REMATCH') {
      if (id === s.hostId && s.match?.phase === 'final') { s.match = null; this.syncTeams(); }
    } else if (msg.type === 'PLAYER_GUESS') {
      const m = s.match;
      if (!m || m.phase !== 'playing' || msg.matchId !== m.id || msg.round !== m.round || now < m.startedAt) return;
      this.guess(id, msg.guessLatLng, now);
    } else if (msg.type === 'ROUND_READY') {
      const m = s.match;
      if (!m || msg.matchId !== m.id || msg.round !== m.round) return;
      const ready = this.isTeamsMode()
        ? this.teamFor(id) && this.teamHasGuess(this.teamFor(id).id, m.round)
        : !!m.guesses[m.round]?.[id];
      if (!ready) return;
      if (!m.ready.includes(id)) m.ready.push(id);
      this.advance(now);
    } else if (msg.type === 'SKIP_LOCATION') {
      const m = s.match;
      if (id !== s.hostId || !m || m.phase !== 'playing' || Object.keys(m.guesses[m.round] || {}).length || m.swaps >= 5) return;
      const next = drawLocations(this.pool(), 1, s.rotation, this.poolKey(), m.plan.map(r => r.id))[0];
      if (!next) return;
      m.plan[m.round - 1] = { id: next.id, heading: randomInt(360) };
      s.recent = s.rotation.history;
      m.swaps++;
      this.startRound(now);
    }
  }
  guess(id, ll, now) {
    const s = this.state, m = s.match, cfg = modes[s.mode];
    const round = m.guesses[m.round] ||= {};
    const team = this.isTeamsMode() ? this.teamFor(id) : null;
    if (this.isTeamsMode()) {
      if (!team) return;
      const role = m.roles?.[id];
      if (role !== 'pinner' && role !== 'both') return;
      // One guess per team per round, wherever it came from.
      if (team.playerIds.some(pid => round[pid])) return;
    }
    if (round[id]) return;
    const valid = ll && typeof ll.lat === 'number' && typeof ll.lng === 'number' && Number.isFinite(ll.lat) && Number.isFinite(ll.lng) && Math.abs(ll.lat) <= 90 && Math.abs(ll.lng) <= 180 && now <= m.deadline;
    const point = valid ? { lat: ll.lat, lng: ll.lng } : null;
    const target = Object.values(locations).flat().find(l => l.id === m.plan[m.round - 1].id);
    const dist = point ? distance(target, point) : null;
    const elapsed = Math.max(0, Math.min(cfg.time, (now - m.startedAt) / 1000));
    const { distScore, speedBonus, bountyBonus, score } = scoreRound(s.mode, cfg, dist, elapsed);
    const result = { playerId: id, round: m.round, dist, elapsed, distScore, speedBonus, bountyBonus, score, guessLatLng: point };
    if (team) {
      result.teamId = team.id;
      for (const pid of team.playerIds) round[pid] = { ...result, playerId: pid };
      m.teamGuesses ||= {};
      m.teamGuesses[m.round] ||= {};
      m.teamGuesses[m.round][team.id] = result;
    } else {
      round[id] = result;
    }
    if (cfg.isBounty && point) m.deadline = Math.min(m.deadline, now + 15000);
  }
  advance(now) {
    const s = this.state, m = s.match;
    if (!m || m.phase !== 'playing' || !s.players.length || !s.players.every(p => m.ready.includes(p.id))) return;
    if (m.round >= modes[s.mode].rounds) m.phase = 'final';
    else { m.round++; this.startRound(now); }
  }
  disconnect(id, now = Date.now(), explicit = false) {
    const s = this.state, p = s.players.find(p => p.id === id);
    if (!p) return;
    p.connected = false;
    p.leftAt = explicit ? now - GRACE_MS : now;
    this.tick(now);
  }
  tick(now = Date.now()) {
    const s = this.state;
    s.players = s.players.filter(p => p.connected || p.leftAt + GRACE_MS > now);
    this.pruneTeams();
    if (!s.players.some(p => p.id === s.hostId)) s.hostId = s.players.find(p => p.connected)?.id || s.players[0]?.id || null;
    if (!s.players.length || (s.updatedAt && now - s.updatedAt > ROOM_TTL)) {
      this.state = initialState();
      return;
    }
    if (!s.match) this.syncTeams();
    const m = s.match;
    if (m?.phase === 'playing' && this.isTeamsMode()) m.roles = this.roundRoles();
    if (m?.phase === 'playing' && now >= m.deadline) {
      if (this.isTeamsMode()) {
        for (const team of s.teams) {
          if (this.teamHasGuess(team.id, m.round)) continue;
          const candidate = team.playerIds.find(id => m.roles?.[id] === 'pinner' || m.roles?.[id] === 'both')
            || team.playerIds.find(id => s.players.some(p => p.id === id && p.connected));
          if (candidate) this.guess(candidate, null, now);
        }
      } else {
        for (const p of s.players) this.guess(p.id, null, now);
      }
    }
    this.advance(now);
  }
  nextAlarm(now = Date.now()) {
    const s = this.state;
    const deadlines = s.players.filter(p => !p.connected).map(p => p.leftAt + GRACE_MS);
    if (s.match?.phase === 'playing' && s.match.deadline > now) deadlines.push(s.match.deadline + 1);
    if (s.players.length) deadlines.push(s.updatedAt + ROOM_TTL);
    return deadlines.length ? Math.max(now + 1, Math.min(...deadlines)) : null;
  }
  snapshot(viewerId) {
    const s = this.state;
    const pool = this.pool(), key = this.poolKey();
    const remaining = s.rotation.decks?.[key]?.length ?? pool.filter(l => !s.rotation.history.includes(l.id)).length;
    let match = s.match;
    if (match) {
      match = { ...match, plan: match.plan.map(round => ({ ...round })) };
      if (this.isTeamsMode() && viewerId) {
        const team = this.teamFor(viewerId);
        match.role = match.roles?.[viewerId] || null;
        match.teamId = team?.id || null;
        // The Pinner must not learn the current target until the team guess
        // has been accepted (the reveal). Viewers still get the location so
        // they can load the panorama.
        if (match.role === 'pinner' && !(team && this.teamHasGuess(team.id, match.round))) {
          match.plan[match.round - 1] = { ...match.plan[match.round - 1], id: null, redacted: true };
        }
        // Future rounds are never needed by the client in advance; hide them so
        // nobody can read ahead to a round where they will be the Pinner.
        for (let i = match.round; i < match.plan.length; i++) match.plan[i] = { ...match.plan[i], id: null, redacted: true };
      }
    }
    return {
      hostId: s.hostId,
      mode: s.mode,
      selection: { poolSize: pool.length, remaining },
      players: s.players.map(({ id, profile, connected }) => ({ id, ...profile, connected, isHost: id === s.hostId })),
      teams: s.teams.map(team => ({ id: team.id, playerIds: [...team.playerIds] })),
      match
    };
  }
}
