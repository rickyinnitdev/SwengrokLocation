import { locations, modes } from '../.generated/game-data.js';
import { drawLocations } from './location-rotation.js';
import { distance, scoreRound } from './scoring.js';
import { poolFor, poolKeyFor } from './pools.js';
import { ROYALE_CAP, DEFAULT_SETTINGS, cleanSettings, roundTime, makeZone, resolveRound, placementPoints } from './royale.js';
import { stripLocked } from '../client/data/avatar-unlocks.js';

export const MAX_PLAYERS = 8;
export const MAX_SPECTATORS = 8;
export const GRACE_MS = 30000;
const ROOM_TTL = 2 * 60 * 60 * 1000;
export const EMOTES = ['🛵 Vroom!', '📍 Easy spot!', '🤔 No clue!', '🔥 Ready!', '👑 GG!'];
const clean = (s, fallback, n = 60) => typeof s === 'string' ? s.replace(/[<>\x00-\x1f]/g, '').trim().slice(0, n) || fallback : fallback;
const ALL_UNLOCKS = ['tuktuk', 'legend', 'royale'];
// `wantedProfile` keeps what the player asked for (field-limited, string-only). The visible profile
// is that, minus anything locked, so a later-confirmed unlock can restore it.
export function wantedProfile(p) { return profile(p, ALL_UNLOCKS); }
export function profile(p = {}, unlocks = []) {
  // Preserve only small, primitive avatar fields. The client validates their values.
  const avatarConfig = {};
  if (p?.avatarConfig && typeof p.avatarConfig === 'object') {
    for (const [k, v] of Object.entries(p.avatarConfig).slice(0, 24)) {
      if (typeof v === 'string') avatarConfig[clean(k, '', 30)] = clean(v, '', 40);
      else if (typeof v === 'boolean') avatarConfig[clean(k, '', 30)] = v; // e.g. blush
    }
  }
  // Items that must be earned (rank frames, the Royale frame) are removed unless the player has the unlock.
  return { name: clean(p?.name, 'Explorer', 24), title: clean(p?.title, 'Explorer'), avatarType: 'custom', avatarConfig: stripLocked(avatarConfig, unlocks) };
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
  return { players: [], hostId: null, mode: 'classic', match: null, teams: [], recent: [], rotation: { history: [] }, spectatorsSeeAnswer: false, royaleSettings: { ...DEFAULT_SETTINGS }, updatedAt: 0 };
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
  // Spectators live in the same list as players, flagged by `role`. Anything that counts
  // players (ready, guesses, scoring, capacity, host transfer) must go through these two.
  roster() { return this.state.players.filter(p => p.role !== 'spectator'); }
  spectators() { return this.state.players.filter(p => p.role === 'spectator'); }
  isRoyale() { return !!modes[this.state.mode]?.royale; }
  isWorldMode() { const c = modes[this.state.mode]; return !!(c?.isWorld || c?.pool === 'countries'); }
  // Players who still have to guess this round. In Royale, ghosts do not.
  contenders() {
    const m = this.state.match;
    if (!m?.royale) return this.roster();
    return this.roster().filter(p => m.royale.players[p.id]?.alive);
  }
  isGhost(id) {
    const m = this.state.match;
    return !!m?.royale && !!m.royale.players[id] && !m.royale.players[id].alive;
  }
  isSpectator(id) { return this.state.players.some(p => p.id === id && p.role === 'spectator'); }
  connectedIds() {
    return this.roster().filter(p => p.connected).map(p => p.id);
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
      // A match is on (or its results are showing): the newcomer watches and joins the next lobby.
      const spectate = !!s.match;
      if (spectate && this.spectators().length >= MAX_SPECTATORS) throw new Error('Room is full, try again after this match.');
      if (!spectate && this.roster().length >= MAX_PLAYERS) throw new Error('This party is full (8 players).');
      player = { id: crypto.randomUUID(), token: crypto.randomUUID(), profile: profile(p), wanted: wantedProfile(p), unlocks: [], connected: true, leftAt: null, role: spectate ? 'spectator' : 'player', joinedAt: now };
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
      if (!s.hostId && player.role === 'player') { s.hostId = player.id; s.mode = Object.hasOwn(modes, mode) ? mode : 'classic'; }
    }
    player.connected = true;
    player.leftAt = null;
    if (!s.match) { player.wanted = wantedProfile(p); player.profile = profile(player.wanted, player.unlocks); }
    if (!s.match) this.syncTeams();
    s.updatedAt = now;
    return player;
  }
  // Back in the lobby: spectators become players in join order while seats remain.
  promoteSpectators() {
    const free = MAX_PLAYERS - this.roster().length;
    this.spectators().sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0)).slice(0, Math.max(0, free)).forEach(p => { p.role = 'player'; });
  }
  pool() { return poolFor(modes[this.state.mode]); }
  poolKey() { return poolKeyFor(modes[this.state.mode]); }
  makePlan() {
    const s = this.state, count = this.isRoyale() ? 1 : modes[s.mode].rounds; // Royale draws one location per round
    const pool = this.pool();
    const picks = drawLocations(pool, count, s.rotation, this.poolKey());
    s.recent = s.rotation.history;
    return picks.map(l => ({ id: l.id, heading: randomInt(360) }));
  }
  startRound(now) {
    const m = this.state.match;
    m.startedAt = now + 800;
    m.ready = [];
    if (m.royale) {
      const R = m.royale;
      R.duel = this.contenders().length === 2;
      m.roundTime = roundTime(R.settings, m.round);
      const target = this.targetOf(m);
      R.zone = target ? makeZone(target, m.round, this.isWorldMode()) : null;
      delete R.results[m.round];
    } else m.roundTime = modes[this.state.mode].time;
    m.deadline = m.startedAt + m.roundTime * 1000;
    if (this.isTeamsMode()) m.roles = this.roundRoles();
  }
  targetOf(m = this.state.match) {
    const id = m?.plan[m.round - 1]?.id;
    return id ? Object.values(locations).flat().find(l => l.id === id) : null;
  }
  newRoyale() {
    const settings = cleanSettings(this.state.royaleSettings);
    const players = {};
    for (const p of this.roster()) players[p.id] = { name: p.profile.name, lives: settings.lives, shield: false, alive: true, eliminatedRound: null, bestDist: null, shieldsUsed: 0, survived: 0 };
    return { settings, players, order: [], results: {}, ghostPins: {}, zone: null, duel: false, ended: false };
  }
  handle(id, msg, now = Date.now()) {
    const s = this.state, p = s.players.find(p => p.id === id);
    if (!p || !p.connected || !msg || typeof msg !== 'object') return;
    s.updatedAt = now;
    // Spectators never touch the match: no guesses, no ready, no teams, no settings.
    if (p.role === 'spectator' && msg.type !== 'UPDATE_PROFILE') return;
    if (msg.type === 'UPDATE_PROFILE') {
      if (!s.match) { p.wanted = wantedProfile(msg.profile); p.profile = profile(p.wanted, p.unlocks); }
    } else if (msg.type === 'SET_MODE') {
      if (id !== s.hostId || s.match || !Object.hasOwn(modes, msg.mode)) return;
      s.mode = msg.mode;
      this.syncTeams(true);
    } else if (msg.type === 'SET_ROYALE') {
      if (id === s.hostId && !s.match) s.royaleSettings = cleanSettings({ ...s.royaleSettings, ...msg.settings });
    } else if (msg.type === 'SET_SPECTATOR_ANSWER') {
      if (id === s.hostId && typeof msg.value === 'boolean') s.spectatorsSeeAnswer = msg.value;
    } else if (msg.type === 'SET_TEAMS') {
      if (id !== s.hostId || s.match || !this.isTeamsMode() || !this.validTeams(msg.teams)) return;
      this.applyTeams(msg.teams);
    } else if (msg.type === 'START_MATCH') {
      if (id !== s.hostId || s.match || this.roster().filter(p => p.connected).length < 2 || this.roster().some(p => !p.connected)) return;
      if (this.isTeamsMode() && !this.validTeams(s.teams)) this.syncTeams(true);
      if (this.isTeamsMode() && !this.validTeams(s.teams)) return;
      s.match = { id: crypto.randomUUID(), phase: 'playing', plan: this.makePlan(), round: 1, guesses: {}, ready: [], swaps: 0 };
      if (this.isRoyale()) s.match.royale = this.newRoyale();
      this.startRound(now);
    } else if (msg.type === 'REMATCH') {
      if (id === s.hostId && s.match?.phase === 'final') { s.match = null; this.promoteSpectators(); this.syncTeams(); }
    } else if (msg.type === 'GHOST_PIN') {
      this.ghostPin(id, msg.latLng, now);
    } else if (msg.type === 'PLAYER_GUESS') {
      const m = s.match;
      if (!m || m.phase !== 'playing' || msg.matchId !== m.id || msg.round !== m.round || now < m.startedAt) return;
      if (m.royale && !m.royale.players[id]?.alive) return; // ghosts do not guess
      this.guess(id, msg.guessLatLng, now);
      this.resolveIfDone(now);
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
    const roundTime = m.roundTime || cfg.time;
    const elapsed = Math.max(0, Math.min(roundTime, (now - m.startedAt) / 1000));
    const { distScore, speedBonus, bountyBonus, score } = scoreRound(s.mode, { ...cfg, time: roundTime }, dist, elapsed);
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
    if (!m || m.phase !== 'playing') return;
    if (m.royale) {
      // Wait for the living to be ready once the round has been resolved.
      const R = m.royale, living = this.contenders();
      if (!R.results[m.round]) return;
      if (!living.every(p => m.ready.includes(p.id))) return;
      if (R.ended || m.round >= ROYALE_CAP) { this.finishRoyale(); return; }
      this.drawNextRoyaleLocation();
      m.round++;
      this.startRound(now);
      return;
    }
    if (!this.roster().length || !this.roster().every(p => m.ready.includes(p.id))) return;
    if (m.round >= modes[s.mode].rounds) m.phase = 'final';
    else { m.round++; this.startRound(now); }
  }
  drawNextRoyaleLocation() {
    const s = this.state, m = s.match;
    const next = drawLocations(this.pool(), 1, s.rotation, this.poolKey(), m.plan.map(r => r.id))[0];
    if (!next) { m.royale.ended = true; return; }
    m.plan.push({ id: next.id, heading: randomInt(360) });
    s.recent = s.rotation.history;
  }
  // Everyone alive has a guess (or the clock ran out and the gaps were filled): decide the round.
  resolveIfDone(now) {
    const s = this.state, m = s.match;
    if (!m?.royale || m.phase !== 'playing' || m.royale.results[m.round]) return;
    const round = m.guesses[m.round] || {};
    const living = this.contenders();
    if (!living.length || !living.every(p => round[p.id])) return;
    const R = m.royale;
    const outcomes = resolveRound({
      alive: living.map(p => ({ id: p.id, dist: round[p.id].dist, lives: R.players[p.id].lives, shield: R.players[p.id].shield })),
      world: this.isWorldMode(), duel: R.duel
    });
    const farthest = id => round[id].dist ?? Infinity;
    const eliminated = [];
    for (const o of outcomes) {
      const st = R.players[o.id];
      st.lives = o.lives; st.shield = o.shield; st.survived = m.round;
      if (o.shieldBlocked) st.shieldsUsed++;
      const d = round[o.id].dist;
      if (d !== null && (st.bestDist === null || d < st.bestDist)) st.bestDist = d;
      if (o.eliminated) { st.alive = false; st.eliminatedRound = m.round; eliminated.push(o.id); }
    }
    // Same-round eliminations: the farther guess goes out first, so it places lower.
    eliminated.sort((a, b) => farthest(b) - farthest(a)).forEach(id => R.order.push(id));
    R.results[m.round] = outcomes.map(o => ({ id: o.id, lostLife: o.lostLife, shieldBlocked: o.shieldBlocked, shieldGained: o.shieldGained, eliminated: o.eliminated, lives: o.lives }));
    if (this.contenders().length <= 1) R.ended = true;
  }
  // Final order: the survivor(s) first, then reverse elimination order. At the round cap, lives then total distance.
  placements() {
    const m = this.state.match;
    if (!m?.royale) return [];
    const R = m.royale;
    const ids = this.roster().map(p => p.id);
    const total = id => Object.values(m.guesses).reduce((sum, r) => sum + (r[id]?.dist ?? 20000000), 0);
    const alive = ids.filter(id => R.players[id]?.alive).sort((a, b) => (R.players[b].lives - R.players[a].lives) || (total(a) - total(b)));
    const out = [...ids.filter(id => !R.players[id]?.alive && !R.order.includes(id)), ...[...R.order].reverse()];
    return [...alive, ...out].map((id, i) => ({ id, place: i + 1, points: placementPoints(i + 1) }));
  }
  finishRoyale() {
    const m = this.state.match;
    m.phase = 'final';
    m.royale.placements = this.placements();
    // Hook for the party leaderboard (see worker.recordFinished): results are read from m.royale.placements.
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
    // Royale: a player gone past the grace period is out, not merely absent.
    if (s.match?.royale && s.match.phase === 'playing') {
      for (const p of s.players) {
        const st = s.match.royale.players[p.id];
        if (!p.connected && p.leftAt + GRACE_MS <= now && st?.alive) {
          st.alive = false; st.lives = 0; st.eliminatedRound = s.match.round; s.match.royale.order.push(p.id);
        }
      }
      // Quitters can leave a single survivor: that player has won, with no solo round to play.
      if (this.contenders().length <= 1) { s.match.royale.ended = true; this.finishRoyale(); }
    }
    s.players = s.players.filter(p => p.connected || p.leftAt + GRACE_MS > now);
    this.pruneTeams();
    if (s.match && !this.roster().length && this.spectators().length) {
      // Every player left mid-match: the watchers take over a fresh lobby.
      s.match = null;
      this.spectators().forEach(p => { p.role = 'player'; });
      s.hostId = null;
    }
    if (!s.players.some(p => p.id === s.hostId) || this.isSpectator(s.hostId)) {
      // The host is never a spectator while a match is running.
      const pick = list => list.find(p => p.connected)?.id || list[0]?.id || null;
      s.hostId = pick(this.roster()) || pick(s.players);
    }
    if (!s.players.length || (s.updatedAt && now - s.updatedAt > ROOM_TTL)) {
      this.state = initialState();
      return;
    }
    // In the lobby, spectators who were left waiting take any seat that frees up, in join order.
    if (!s.match) { this.promoteSpectators(); this.syncTeams(); }
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
        for (const p of this.contenders()) this.guess(p.id, null, now);
      }
    }
    this.resolveIfDone(now);
    if (m?.royale && m.phase === 'playing' && !m.royale.results[m.round] && !this.contenders().length) { m.royale.ended = true; this.finishRoyale(); }
    this.advance(now);
  }
  nextAlarm(now = Date.now()) {
    const s = this.state;
    const deadlines = s.players.filter(p => !p.connected).map(p => p.leftAt + GRACE_MS);
    if (s.match?.phase === 'playing' && s.match.deadline > now) deadlines.push(s.match.deadline + 1);
    // Ghosts are shown the answer 5 s into a Royale round, so wake up then to broadcast it.
    if (s.match?.royale && s.match.phase === 'playing' && s.match.startedAt + 5000 > now) deadlines.push(s.match.startedAt + 5001);
    if (s.players.length) deadlines.push(s.updatedAt + ROOM_TTL);
    return deadlines.length ? Math.max(now + 1, Math.min(...deadlines)) : null;
  }
  ghostPin(id, ll, now) {
    const m = this.state.match;
    if (!m?.royale || m.phase !== 'playing' || !m.royale.settings.ghostPins) return;
    const st = m.royale.players[id];
    if (!st || st.alive) return; // only eliminated players
    const pins = m.royale.ghostPins[m.round] ||= [];
    if (pins.some(p => p.by === id)) return; // one per ghost per round
    if (!ll || !Number.isFinite(ll.lat) || !Number.isFinite(ll.lng) || Math.abs(ll.lat) > 90 || Math.abs(ll.lng) > 180) return;
    pins.push({ by: id, lat: ll.lat, lng: ll.lng });
  }
  // Per-viewer Royale view. Living players see who has locked in, never where (or how well) until the
  // round is decided. Ghosts also get the answer 5 s into the round and see the living locks as they happen.
  royaleView(match, viewerId, now) {
    const m = match, R = { ...m.royale };
    const me = R.players[viewerId];
    const ghost = !!me && !me.alive;
    const decided = !!R.results[m.round];
    m.guesses = Object.fromEntries(Object.entries(m.guesses).map(([round, byPlayer]) => {
      if (Number(round) < m.round || decided || m.phase === 'final' || ghost) return [round, byPlayer];
      return [round, Object.fromEntries(Object.entries(byPlayer).map(([pid, g]) => [pid, pid === viewerId ? g : { playerId: g.playerId, round: g.round, elapsed: g.elapsed, locked: true }]))];
    }));
    // Future rounds do not exist yet (drawn lazily); the current id is needed to load the panorama.
    if (ghost && !decided && now >= m.startedAt + 5000) {
      const t = this.targetOf(m);
      if (t) m.answer = { lat: t.lat, lng: t.lng };
    }
    const pins = (R.ghostPins[m.round] || []);
    R.ghostPins = undefined;
    R.ghostPinCount = pins.length;
    R.ghostPinList = pins.map(p => ({ lat: p.lat, lng: p.lng })).sort(() => 0.5 - Math.random());
    R.mineDropped = !!pins.find(p => p.by === viewerId);
    R.results = Object.fromEntries(Object.entries(R.results).filter(([round]) => Number(round) < m.round || decided));
    R.you = viewerId;
    m.royale = R;
    return m;
  }
  // Has the current round been decided? (everyone guessed, or time ran out and tick filled the gaps)
  roundRevealed(m = this.state.match) {
    if (!m) return false;
    if (m.royale) return !!m.royale.results[m.round];
    const round = m.guesses[m.round] || {};
    return this.roster().every(p => round[p.id]);
  }
  // What a spectator may see. Spectators are often in the same room as the players, so by default
  // they get no answer and no distances until the reveal. A locked pin cannot help its owner any more,
  // so its position (not its distance or score) is shown. Future rounds are never sent.
  spectatorView(match) {
    const open = !!this.state.spectatorsSeeAnswer;
    const m = match;
    const revealed = this.roundRevealed(m) || m.phase === 'final';
    const guesses = {};
    for (const [round, byPlayer] of Object.entries(m.guesses || {})) {
      const past = Number(round) < m.round || m.phase === 'final';
      guesses[round] = {};
      for (const [pid, g] of Object.entries(byPlayer)) {
        guesses[round][pid] = past || revealed || open
          ? g
          : { playerId: g.playerId, round: g.round, elapsed: g.elapsed, guessLatLng: g.guessLatLng, locked: true };
      }
    }
    m.guesses = guesses;
    m.plan = m.plan.map((r, i) => (i < m.round ? r : { ...r, id: null, redacted: true }));
    if (m.royale) {
      // Ghost pins are anonymous for everyone but their author.
      const pins = m.royale.ghostPins?.[m.round] || [];
      m.royale = { ...m.royale, ghostPins: undefined, ghostPinCount: pins.length, ghostPinList: pins.map(p => ({ lat: p.lat, lng: p.lng })) };
    }
    // The panorama needs the location id, exactly as it does for players. The coordinates themselves
    // are only sent as `answer` when the host allowed it or the round is over.
    const target = m.plan[m.round - 1]?.id ? Object.values(locations).flat().find(l => l.id === m.plan[m.round - 1].id) : null;
    if (target && (open || revealed)) m.answer = { lat: target.lat, lng: target.lng };
    m.role = 'spectator';
    return m;
  }
  snapshot(viewerId, now = Date.now()) {
    const s = this.state;
    const pool = this.pool(), key = this.poolKey();
    const remaining = s.rotation.decks?.[key]?.length ?? pool.filter(l => !s.rotation.history.includes(l.id)).length;
    let match = s.match;
    const viewerIsSpectator = !!viewerId && this.isSpectator(viewerId);
    if (match) {
      match = { ...match, plan: match.plan.map(round => ({ ...round })) };
      if (viewerIsSpectator) match = this.spectatorView(match);
      else if (match.royale) match = this.royaleView(match, viewerId, now);
      else if (this.isTeamsMode() && viewerId) {
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
      players: this.roster().map(({ id, profile, connected }) => ({ id, ...profile, connected, isHost: id === s.hostId, role: 'player' })),
      spectators: this.spectators().map(({ id, profile, connected }) => ({ id, ...profile, connected, role: 'spectator' })),
      spectatorCount: this.spectators().length,
      spectatorsSeeAnswer: !!s.spectatorsSeeAnswer,
      royaleSettings: s.royaleSettings || { ...DEFAULT_SETTINGS },
      viewerRole: viewerId ? (viewerIsSpectator ? 'spectator' : 'player') : null,
      teams: s.teams.map(team => ({ id: team.id, playerIds: [...team.playerIds] })),
      match
    };
  }
}
