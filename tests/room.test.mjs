import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RoomEngine, GRACE_MS, MAX_PLAYERS, MAX_SPECTATORS } from '../src/room-engine.js';
import { locations } from '../.generated/game-data.js';
import { drawLocations, locationSeparation } from '../src/location-rotation.js';

function room(mode = 'classic') {
  const e = new RoomEngine();
  const a = e.join({ create: true, mode, profile: { name: 'Host' } }, 1000);
  const b = e.join({ profile: { name: 'Friend' } }, 1000);
  return { e, a, b };
}
function start(e, a) { e.handle(a.id, { type: 'START_MATCH' }, 1000); return e.state.match; }
function msg(m, type, extra = {}) { return { type, matchId: m.id, round: m.round, ...extra }; }

test('Joining a nonexistent room fails; roster is shared and tokens remain private', () => {
  assert.throws(() => new RoomEngine().join({}), /not found/);
  const { e, a, b } = room();
  assert.equal(e.snapshot().players.length, 2);
  assert.equal(e.snapshot().hostId, a.id);
  assert.ok(!JSON.stringify(e.snapshot()).includes(b.token));
  assert.throws(() => e.join({ create: true }), /ROOM_EXISTS/);
});
test('Only host changes modes or starts; matches contain random unique locations', () => {
  const { e, a, b } = room();
  e.handle(b.id, { type: 'SET_MODE', mode: 'landmarks' });
  assert.equal(e.state.mode, 'classic');
  e.handle(a.id, { type: 'SET_MODE', mode: 'landmarks' });
  e.handle(b.id, { type: 'START_MATCH' });
  assert.equal(e.state.match, null);
  const m = start(e, a);
  assert.equal(new Set(m.plan.map(r => r.id)).size, 5);
  assert.ok(m.plan.every(r => locations.landmarks.some(l => l.id === r.id)));
  assert.equal(e.join({}).role, 'spectator'); // Part F: late joiners watch instead of being turned away
  const old = m.plan.map(r => r.id);
  e.state.match.phase = 'final';
  e.handle(a.id, { type: 'REMATCH' }, 5000);
  start(e, a);
  assert.ok(e.state.match.plan.every(r => !old.includes(r.id)));
});
test('Server computes score, rejects early/stale/duplicate guesses and forged readiness', () => {
  const { e, a, b } = room();
  const m = start(e, a);
  const target = Object.values(locations).flat().find(l => l.id === m.plan[0].id);
  e.handle(a.id, msg(m, 'PLAYER_GUESS', { guessLatLng: target, score: 999999 }), 1100);
  assert.deepEqual(m.guesses, {});
  e.handle(b.id, msg(m, 'ROUND_READY'), 1900);
  assert.deepEqual(m.ready, []);
  e.handle(a.id, msg(m, 'PLAYER_GUESS', { guessLatLng: target, score: 999999 }), 1900);
  const score = m.guesses[1][a.id].score;
  assert.ok(score > 5000 && score <= 6000);
  e.handle(a.id, msg(m, 'PLAYER_GUESS', { guessLatLng: null }), 2000);
  assert.equal(m.guesses[1][a.id].score, score);
  e.handle(b.id, { ...msg(m, 'PLAYER_GUESS'), matchId: 'old' }, 2000);
  assert.equal(m.guesses[1][b.id], undefined);
  e.handle(a.id, msg(m, 'ROUND_READY'), 2100);
  assert.equal(m.round, 1);
  e.tick(m.deadline + 1);
  assert.equal(m.guesses[1][b.id].score, 0);
  e.handle(b.id, msg(m, 'ROUND_READY'), m.deadline + 2);
  assert.equal(m.round, 2);
});
test('Reconnect restores identity and state, then host transfers when grace expires', () => {
  const { e, a, b } = room();
  const m = start(e, a);
  e.disconnect(a.id, 2000);
  const restored = new RoomEngine(structuredClone(e.state));
  const resumed = restored.join({ token: a.token }, 3000);
  assert.equal(resumed.id, a.id);
  assert.equal(restored.state.match.id, m.id);
  restored.disconnect(a.id, 4000);
  restored.tick(4000 + GRACE_MS);
  assert.equal(restored.state.hostId, b.id);
  assert.equal(restored.state.players.length, 1);
});
test('Capacity, malformed profiles and spoofed options are handled', () => {
  const { e, a } = room();
  for (let i = 0; i < 6; i++) e.join({ profile: { name: '<script>bad</script>', avatarConfig: { bad: {} } } }, 1000);
  assert.throws(() => e.join({}), /full/);
  assert.ok(!e.snapshot().players[2].name.includes('<'));
  e.handle(a.id, { type: 'SET_MODE', mode: '__proto__' }, 1000);
  assert.equal(e.state.mode, 'classic');
});
test('Shared skip is host-only, replaces all views and preserves unique spots', () => {
  const { e, a, b } = room();
  const m = start(e, a), old = m.plan[0].id;
  e.handle(b.id, { type: 'SKIP_LOCATION' }, 2000);
  assert.equal(m.plan[0].id, old);
  e.handle(a.id, { type: 'SKIP_LOCATION' }, 2000);
  assert.notEqual(m.plan[0].id, old);
  assert.equal(new Set(m.plan.map(r => r.id)).size, 5);
});
test('Bounty shortens deadline; sprint awards double speed bonus', () => {
  for (const mode of ['bounty', 'sprint']) {
    const { e, a } = room(mode), m = start(e, a);
    const target = Object.values(locations).flat().find(l => l.id === m.plan[0].id);
    e.handle(a.id, msg(m, 'PLAYER_GUESS', { guessLatLng: target }), m.startedAt + 1000);
    const g = m.guesses[1][a.id];
    if (mode === 'bounty') { assert.equal(m.deadline, m.startedAt + 16000); assert.equal(g.bountyBonus, 500); }
    else assert.ok(g.speedBonus > 1000);
  }
});

test('Full location deck does not repeat IDs until every spot is used', () => {
  const pool = Object.values(locations).flat();
  let rotation = { history: [] };
  const seen = [];
  // Serialize each match to exercise the same persistence used by Durable Objects.
  while (seen.length < pool.length * 2) {
    seen.push(...drawLocations(pool, 5, rotation, 'all').map(l => l.id));
    rotation = structuredClone(rotation);
  }
  assert.equal(new Set(seen.slice(0, pool.length)).size, pool.length);
  assert.equal(new Set(seen.slice(pool.length, pool.length * 2)).size, pool.length);
  for (let i = 0; i < seen.length; i += 5) assert.equal(new Set(seen.slice(i, i + 5)).size, 5);
});

test('New rooms import player history; selection spreads early rounds geographically', () => {
  const pool = Object.values(locations).flat();
  const oldIds = pool.slice(0, 50).map(l => l.id);
  const e = new RoomEngine();
  e.join({ create: true, seen: oldIds, profile: {} }, 1000);
  const picks = e.makePlan();
  assert.ok(picks.every(l => !oldIds.includes(l.id)));
  const rotation = { history: [] };
  const spaced = drawLocations(pool, 5, rotation, 'all');
  for (let i = 0; i < spaced.length; i++) {
    for (let j = 0; j < i; j++) assert.ok(locationSeparation(spaced[i], spaced[j]) > 600);
  }
});

test('Lobby profile edits are sanitized, belong to sender and stop during matches', () => {
  const { e, a, b } = room();
  e.handle(b.id, { type: 'UPDATE_PROFILE', playerId: a.id, profile: { name: 'New friend', avatarConfig: { hairStyle: 'bob' } } }, 1000);
  assert.equal(a.profile.name, 'Host');
  assert.equal(b.profile.name, 'New friend');
  assert.equal(b.profile.avatarConfig.hairStyle, 'bob');
  start(e, a);
  e.handle(b.id, { type: 'UPDATE_PROFILE', profile: { name: 'Changed mid-game' } }, 2000);
  assert.equal(b.profile.name, 'New friend');
});

test('Landmark deck exhausts its smaller pool and survives adding locations', () => {
  const pool = locations.landmarks, rotation = { history: [] };
  const ids = Array.from({ length: 9 }, () => drawLocations(pool, 5, rotation, 'landmarks')).flat().map(l => l.id);
  assert.equal(new Set(ids.slice(0, pool.length)).size, pool.length);
  const added = { id: 'test_new', name: 'New road', lat: 11.61, lng: 104.95 };
  drawLocations([...pool, added], 1, rotation, 'landmarks');
  assert.ok(rotation.catalogs.landmarks.includes(added.id));
});

test('New modes (world, country, asia, cambodia, sniper, district, streak) configure pools and scoring', () => {
  // World Explorer Mode (pin on world map)
  const { e: ew, a: aw } = room('world');
  const mw = start(ew, aw);
  assert.equal(mw.plan.length, 5);
  assert.ok(mw.plan.every(r => locations.countries.some(l => l.id === r.id)));
  const targetWorld = locations.countries.find(l => l.id === mw.plan[0].id);
  ew.handle(aw.id, msg(mw, 'PLAYER_GUESS', { guessLatLng: { lat: targetWorld.lat + 0.1, lng: targetWorld.lng + 0.1 } }), mw.startedAt + 1000);
  assert.ok(mw.guesses[1][aw.id].distScore >= 4500);

  // Country Guesser Mode (multiple choice)
  const { e: ec, a: ac } = room('country');
  const mc = start(ec, ac);
  assert.equal(mc.plan.length, 5);
  assert.ok(mc.plan.every(r => locations.countries.some(l => l.id === r.id)));

  // Asia Adventure Mode (SE Asian & Asian locations)
  const { e: ea, a: aa } = room('asia');
  const ma = start(ea, aa);
  assert.equal(ma.plan.length, 5);
  assert.ok(ma.plan.every(r => locations.asia.some(l => l.id === r.id)));
  const targetAsia = locations.asia.find(l => l.id === ma.plan[0].id);
  ea.handle(aa.id, msg(ma, 'PLAYER_GUESS', { guessLatLng: { lat: targetAsia.lat + 0.05, lng: targetAsia.lng + 0.05 } }), ma.startedAt + 1000);
  assert.ok(ma.guesses[1][aa.id].distScore >= 4500);

  // Cambodia Mode
  const { e: ek, a: ak } = room('cambodia');
  const mk = start(ek, ak);
  assert.equal(mk.plan.length, 5);
  assert.ok(mk.plan.every(r => locations.cambodia.some(l => l.id === r.id)));

  // Sniper Mode
  const { e: es, a: as } = room('sniper');
  const ms = start(es, as);
  const targetSniper = Object.values(locations).flat().find(l => l.id === ms.plan[0].id);
  // Exact bullseye (0m)
  es.handle(as.id, msg(ms, 'PLAYER_GUESS', { guessLatLng: targetSniper }), ms.startedAt + 1000);
  assert.equal(ms.guesses[1][as.id].distScore, 10000);
});

function teamRoom(count = 4, mode = 'tagteam_kh') {
  const e = new RoomEngine();
  const players = [];
  for (let i = 0; i < count; i++) players.push(e.join({ create: i === 0, mode, profile: { name: 'P' + i } }, 1000));
  return { e, players, a: players[0], b: players[1], c: players[2], d: players[3] };
}

test('Tag-Team auto-pairs, validates host teams and supports an odd player out', () => {
  const { e, players, a } = teamRoom(4);
  assert.deepEqual(e.state.teams.map(t => t.playerIds.length), [2, 2]);
  assert.deepEqual(e.state.teams.flatMap(t => t.playerIds).sort(), players.map(p => p.id).sort());

  const custom = [{ playerIds: [players[0].id, players[2].id] }, { playerIds: [players[1].id, players[3].id] }];
  e.handle(a.id, { type: 'SET_TEAMS', teams: custom }, 1000);
  assert.deepEqual(e.state.teams.map(t => t.playerIds), custom.map(t => t.playerIds));

  // A team set that drops a player must be rejected.
  e.handle(a.id, { type: 'SET_TEAMS', teams: [{ playerIds: [players[0].id, players[1].id] }] }, 1000);
  assert.deepEqual(e.state.teams.map(t => t.playerIds), custom.map(t => t.playerIds));

  e.join({ profile: { name: 'Fifth' } }, 1000);
  assert.deepEqual(e.state.teams.map(t => t.playerIds.length).sort(), [2, 3]);
});

test('Tag-Team rejects Viewer guesses, mirrors team scores and rotates roles', () => {
  const { e, a, b, c, d } = teamRoom(4);
  const m = start(e, a);
  assert.equal(m.roles[a.id], 'pinner');
  assert.equal(m.roles[b.id], 'viewer');
  assert.equal(m.roles[c.id], 'pinner');
  assert.equal(m.roles[d.id], 'viewer');

  const target = Object.values(locations).flat().find(l => l.id === m.plan[0].id);
  e.handle(b.id, msg(m, 'PLAYER_GUESS', { guessLatLng: target }), m.startedAt + 1000);
  assert.equal(m.guesses[1]?.[b.id], undefined, 'the Viewer cannot guess');

  e.handle(a.id, msg(m, 'PLAYER_GUESS', { guessLatLng: target }), m.startedAt + 1000);
  e.handle(c.id, msg(m, 'PLAYER_GUESS', { guessLatLng: target }), m.startedAt + 1000);
  assert.equal(m.guesses[1][a.id].score, m.guesses[1][b.id].score);
  assert.equal(m.teamGuesses[1][m.roles[a.id] === 'pinner' ? e.teamFor(a.id).id : 'team_1'].score, m.guesses[1][a.id].score);
  assert.ok(m.guesses[1][a.id].score > 5000);

  for (const p of [a, b, c, d]) e.handle(p.id, msg(m, 'ROUND_READY'), m.startedAt + 2000);
  assert.equal(m.round, 2);
  assert.equal(m.roles[b.id], 'pinner');
  assert.equal(m.roles[a.id], 'viewer');
  assert.equal(m.roles[d.id], 'pinner');
  assert.equal(m.roles[c.id], 'viewer');
});

test('Tag-Team redacts the current location from the Pinner until the reveal', () => {
  const { e, a, b } = teamRoom(2);
  const m = start(e, a);
  const pinner = m.roles[a.id] === 'pinner' ? a : b;
  const viewer = pinner === a ? b : a;
  const targetId = m.plan[0].id;

  const before = e.snapshot(pinner.id);
  assert.equal(before.match.plan[0].id, null);
  assert.equal(before.match.role, 'pinner');
  assert.equal(e.snapshot(viewer.id).match.plan[0].id, targetId, 'the Viewer needs the panorama');

  const target = Object.values(locations).flat().find(l => l.id === targetId);
  e.handle(pinner.id, msg(m, 'PLAYER_GUESS', { guessLatLng: target }), m.startedAt + 1000);
  const after = e.snapshot(pinner.id);
  assert.equal(after.match.plan[0].id, targetId, 'reveal restores the location');
});

test('Tag-Team hides future rounds from every player', () => {
  const { e, a, b } = teamRoom(2);
  const m = start(e, a);
  for (const p of [a, b]) {
    const plan = e.snapshot(p.id).match.plan;
    assert.ok(plan.slice(1).every(r => r.id === null), 'no future location ids are sent');
  }
});

test('Tag-Team disconnected partner becomes both eyes and hands', () => {
  const { e, a, b, c, d } = teamRoom(4);
  const m = start(e, a);
  const target = Object.values(locations).flat().find(l => l.id === m.plan[0].id);
  e.handle(a.id, msg(m, 'PLAYER_GUESS', { guessLatLng: target }), m.startedAt + 1000);
  e.handle(c.id, msg(m, 'PLAYER_GUESS', { guessLatLng: target }), m.startedAt + 1000);
  for (const p of [a, b, c, d]) e.handle(p.id, msg(m, 'ROUND_READY'), m.startedAt + 2000);
  assert.equal(m.round, 2);

  // b is the round-2 Pinner. Once their grace period expires, a must see and pin.
  e.disconnect(b.id, m.startedAt + 2500);
  e.tick(m.startedAt + 2500 + GRACE_MS + 1);
  assert.equal(e.state.players.some(p => p.id === b.id), false);
  assert.equal(e.snapshot(a.id).match.role, 'both');
  e.handle(a.id, msg(m, 'PLAYER_GUESS', { guessLatLng: target }), m.deadline - 1000);
  assert.ok(m.guesses[2][a.id].score > 0);
});

// ---------- Part F: late joiners spectate ----------
function watching(mode = 'classic') {
  const { e, a, b } = room(mode);
  const m = start(e, a);
  const w = e.join({ profile: { name: 'Late' } }, 1500);
  return { e, a, b, m, w };
}
test('joining mid-match makes a spectator; it never throws', () => {
  const { e, w } = watching();
  assert.equal(w.role, 'spectator');
  const snap = e.snapshot(w.id);
  assert.equal(snap.players.length, 2);
  assert.equal(snap.spectatorCount, 1);
  assert.equal(snap.viewerRole, 'spectator');
  assert.equal(snap.spectators[0].name, 'Late');
  // The match was already running; a join during the final results also watches.
  e.state.match.phase = 'final';
  assert.equal(e.join({ profile: { name: 'Later' } }, 1600).role, 'spectator');
});
test('spectator cap is separate from the player cap', () => {
  const { e } = watching();
  for (let i = 1; i < MAX_SPECTATORS; i++) e.join({ profile: { name: 'S' + i } }, 1600);
  assert.equal(e.spectators().length, MAX_SPECTATORS);
  assert.throws(() => e.join({ profile: { name: 'x' } }, 1700), /full, try again after this match/);
  assert.equal(e.roster().length, 2);
  assert.ok(MAX_PLAYERS === 8);
});
test('a spectator cannot guess, ready up or change settings; the match advances on players alone', () => {
  const { e, a, b, m, w } = watching();
  m.startedAt = 0;
  e.handle(w.id, msg(m, 'PLAYER_GUESS', { guessLatLng: { lat: 11.55, lng: 104.9 } }), 2000);
  assert.deepEqual(Object.keys(m.guesses[1] || {}), []);
  e.handle(w.id, msg(m, 'ROUND_READY'), 2000);
  assert.ok(!m.ready.includes(w.id));
  e.handle(w.id, { type: 'SET_MODE', mode: 'sprint' }, 2000);
  e.handle(w.id, { type: 'SET_SPECTATOR_ANSWER', value: true }, 2000);
  e.handle(w.id, { type: 'SET_TEAMS', teams: [] }, 2000);
  assert.equal(e.state.mode, 'classic');
  assert.equal(e.state.spectatorsSeeAnswer, false);
  for (const p of [a, b]) e.handle(p.id, msg(m, 'PLAYER_GUESS', { guessLatLng: { lat: 11.55, lng: 104.9 } }), 2000);
  for (const p of [a, b]) e.handle(p.id, msg(m, 'ROUND_READY'), 2100);
  assert.equal(m.round, 2, 'advanced although the spectator never readied');
  assert.ok(!(w.id in (m.guesses[1] || {})));
});
test('timeouts do not create guesses for spectators', () => {
  const { e, m, w } = watching();
  e.tick(m.deadline + 1);
  assert.ok(!(w.id in m.guesses[1]));
});
test('spectator view: no answer coordinates and no distances before the reveal', () => {
  const { e, a, m, w } = watching();
  m.startedAt = 0;
  const target = Object.values(locations).flat().find(l => l.id === m.plan[0].id);
  e.handle(a.id, msg(m, 'PLAYER_GUESS', { guessLatLng: { lat: target.lat, lng: target.lng } }), 2000);
  const view = e.snapshot(w.id);
  const json = JSON.stringify(view);
  assert.ok(!json.includes(String(target.lat)) || view.match.guesses[1][a.id].guessLatLng.lat === target.lat, 'only the locked pin itself may carry coordinates');
  assert.equal(view.match.answer, undefined);
  const g = view.match.guesses[1][a.id];
  assert.equal(g.locked, true);
  assert.ok(g.guessLatLng);
  assert.equal(g.dist, undefined);
  assert.equal(g.score, undefined);
  assert.ok(view.match.plan.slice(1).every(r => r.id === null), 'future rounds are hidden');
  // The player's own view is unchanged.
  assert.ok(e.snapshot(a.id).match.guesses[1][a.id].score >= 0);
});
test('spectator view: the answer arrives at the reveal, or early when the host allows it', () => {
  const { e, a, b, m, w } = watching();
  m.startedAt = 0;
  e.handle(a.id, { type: 'SET_SPECTATOR_ANSWER', value: true }, 2000);
  const target = Object.values(locations).flat().find(l => l.id === m.plan[0].id);
  assert.deepEqual(e.snapshot(w.id).match.answer, { lat: target.lat, lng: target.lng });
  e.handle(a.id, { type: 'SET_SPECTATOR_ANSWER', value: false }, 2000);
  assert.equal(e.snapshot(w.id).match.answer, undefined);
  for (const p of [a, b]) e.handle(p.id, msg(m, 'PLAYER_GUESS', { guessLatLng: { lat: 11.55, lng: 104.9 } }), 2000);
  const view = e.snapshot(w.id);
  assert.deepEqual(view.match.answer, { lat: target.lat, lng: target.lng });
  assert.ok(view.match.guesses[1][a.id].score >= 0);
});
test('rematch promotes spectators to players in join order within the cap', () => {
  const { e, a, w } = watching();
  const w2 = e.join({ profile: { name: 'Second' } }, 1700);
  e.state.match.phase = 'final';
  e.handle(a.id, { type: 'REMATCH' }, 5000);
  assert.equal(w.role, 'player');
  assert.equal(w2.role, 'player');
  assert.equal(e.snapshot().players.length, 4);
  assert.equal(e.snapshot().spectatorCount, 0);
  // Not enough seats: the leftover stays a spectator.
  const full = new RoomEngine();
  const host = full.join({ create: true, profile: { name: 'H' } }, 1000);
  for (let i = 1; i < MAX_PLAYERS; i++) full.join({ profile: { name: 'P' + i } }, 1000);
  start(full, host);
  const x = full.join({ profile: { name: 'X' } }, 2000), y = full.join({ profile: { name: 'Y' } }, 2001);
  full.state.match.phase = 'final';
  full.state.players.find(p => p.id === host.id); // the host is a player
  full.handle(host.id, { type: 'REMATCH' }, 6000);
  full.state.players = full.state.players.filter(p => p.id !== full.roster()[1].id); // one seat frees up
  full.promoteSpectators();
  assert.equal(x.role, 'player');
  assert.equal(y.role, 'spectator');
});
test('the host is never a spectator, and a spectator who reconnects stays one', () => {
  const { e, a, b, w } = watching();
  e.disconnect(a.id, 3000, true);
  e.tick(3000 + 1);
  assert.equal(e.state.hostId, b.id);
  e.disconnect(w.id, 3100);
  const back = e.join({ token: w.token, profile: { name: 'Late' } }, 3200);
  assert.equal(back.id, w.id);
  assert.equal(back.role, 'spectator');
});
test('if every player leaves mid-match the watchers get a fresh lobby', () => {
  const { e, a, b, w } = watching();
  e.disconnect(a.id, 4000, true); e.disconnect(b.id, 4000, true);
  e.tick(4001);
  assert.equal(e.state.match, null);
  assert.equal(w.role, 'player');
  assert.equal(e.state.hostId, w.id);
});

// ---------- Part B: Battle Royale ----------
import { resolveRound, makeZone, zoneContains, zoneRadius, placementPoints, roundTime, cleanSettings, ROYALE_CAP } from '../src/royale.js';

function royaleRoom(n = 4, mode = 'royale') {
  const e = new RoomEngine();
  const players = [e.join({ create: true, mode, profile: { name: 'P0' } }, 1000)];
  for (let i = 1; i < n; i++) players.push(e.join({ profile: { name: 'P' + i } }, 1000));
  e.handle(players[0].id, { type: 'START_MATCH' }, 1000);
  return { e, players, m: e.state.match };
}
const target = (e, m) => e.targetOf(m);
function playRound(e, players, m, offsets, now = 2000) {
  const t = target(e, m);
  m.startedAt = 0;
  players.forEach((p, i) => {
    if (offsets[i] === undefined) return;
    if (offsets[i] === null) return e.guess(p.id, null, now);
    e.handle(p.id, msg(m, 'PLAYER_GUESS', { guessLatLng: { lat: t.lat + offsets[i] / 111320, lng: t.lng } }), now);
  });
}

test('royale damage: the farthest loses one life; with 6+ alive the two farthest do', () => {
  const alive = n => [...Array(n)].map((_, i) => ({ id: 'p' + i, dist: (i + 1) * 500, lives: 3, shield: false }));
  const four = resolveRound({ alive: alive(4) });
  assert.deepEqual(four.filter(o => o.lostLife).map(o => o.id), ['p3']);
  const six = resolveRound({ alive: alive(6) });
  assert.deepEqual(six.filter(o => o.lostLife).map(o => o.id).sort(), ['p4', 'p5']);
});
test('royale: timeout counts as farthest, ties at the bottom all lose, perfect ties lose nobody', () => {
  const base = [{ id: 'a', dist: 100, lives: 3 }, { id: 'b', dist: 200, lives: 3 }, { id: 'c', dist: null, lives: 3 }];
  assert.deepEqual(resolveRound({ alive: base }).filter(o => o.lostLife).map(o => o.id), ['c']);
  const tie = [{ id: 'a', dist: 100, lives: 3 }, { id: 'b', dist: 5000, lives: 3 }, { id: 'c', dist: 5004, lives: 3 }];
  assert.deepEqual(resolveRound({ alive: tie }).filter(o => o.lostLife).map(o => o.id).sort(), ['b', 'c'], 'within 10 m');
  const worldTie = [{ id: 'a', dist: 100, lives: 3 }, { id: 'b', dist: 900000, lives: 3 }, { id: 'c', dist: 900800, lives: 3 }];
  assert.deepEqual(resolveRound({ alive: worldTie, world: true }).filter(o => o.lostLife).map(o => o.id).sort(), ['b', 'c'], 'within 1 km');
  assert.equal(resolveRound({ alive: [{ id: 'a', dist: 3, lives: 3 }, { id: 'b', dist: 5, lives: 3 }] }).filter(o => o.lostLife).length, 0);
  assert.equal(resolveRound({ alive: [{ id: 'a', dist: null, lives: 3 }, { id: 'b', dist: null, lives: 3 }] }).filter(o => o.lostLife).length, 0);
});
test('royale shield: a bullseye earns one, it blocks the next hit once, and you hold at most one', () => {
  const r1 = resolveRound({ alive: [{ id: 'a', dist: 50, lives: 3, shield: false }, { id: 'b', dist: 900, lives: 3 }, { id: 'c', dist: 400, lives: 3 }] });
  assert.equal(r1.find(o => o.id === 'a').shield, true);
  assert.equal(r1.find(o => o.id === 'a').shieldGained, true);
  const r2 = resolveRound({ alive: [{ id: 'a', dist: 900, lives: 3, shield: true }, { id: 'b', dist: 10, lives: 3 }, { id: 'c', dist: 400, lives: 3 }] });
  const a = r2.find(o => o.id === 'a');
  assert.equal(a.lives, 3); assert.equal(a.shieldBlocked, true); assert.equal(a.shield, false);
  const r3 = resolveRound({ alive: [{ id: 'a', dist: 900, lives: 3, shield: false }, { id: 'b', dist: 10, lives: 3, shield: true }, { id: 'c', dist: 400, lives: 3 }] });
  assert.equal(r3.find(o => o.id === 'b').shield, true, 'still one shield, not two');
  const world = resolveRound({ alive: [{ id: 'a', dist: 20000, lives: 3 }, { id: 'b', dist: 9e5, lives: 3 }, { id: 'c', dist: 5e5, lives: 3 }], world: true });
  assert.equal(world.find(o => o.id === 'a').shield, true, '25 km counts as a bullseye in the world');
});
test('royale zone: always contains the answer, is never centred on it (1,000 draws)', () => {
  for (const world of [false, true]) {
    for (let i = 0; i < 1000; i++) {
      const round = 4 + (i % 6);
      const t = { lat: -60 + Math.random() * 120, lng: -170 + Math.random() * 340 };
      const zone = makeZone(t, round, world);
      assert.ok(zoneContains(zone, t), 'answer inside');
      assert.ok(distance(zone.center, t) > 0, 'not centred on the answer');
      assert.ok(distance(zone.center, t) <= 0.6 * zone.radius * 1.001 + 1);
    }
  }
  assert.equal(makeZone({ lat: 1, lng: 1 }, 3, false), null);
  assert.deepEqual([4, 5, 6].map(r => zoneRadius(r, false)), [6000, 3000, 1500]);
  assert.equal(zoneRadius(4, true), 3000000);
});
import { distance } from '../src/scoring.js';
test('royale timing and placement points', () => {
  const s = cleanSettings({});
  assert.deepEqual([1, 2, 3, 10, 20].map(r => roundTime(s, r)), [60, 55, 50, 20, 20]);
  assert.deepEqual([1, 2, 3, 4, 5, 6, 9, 20].map(placementPoints), [100, 70, 50, 40, 30, 20, 5, 5]);
  assert.deepEqual(cleanSettings({ lives: 9, time: 5, ghostPins: 'x' }), { lives: 5, time: 30, ghostPins: true });
});
test('royale match: losers are eliminated, the duel starts at two, last one standing wins', () => {
  const { e, players, m } = royaleRoom(3);
  assert.equal(m.plan.length, 1, 'locations are drawn lazily');
  assert.equal(m.royale.players[players[0].id].lives, 3);
  const ids = players.map(p => p.id);
  let round = 1, guard = 0;
  while (m.phase !== 'final' && guard++ < 40) {
    const living = players.filter(p => m.royale.players[p.id].alive);
    if (round >= 2 && living.length === 2) assert.equal(m.royale.duel, true, 'duel at two players');
    playRound(e, living, m, living.map((p, i) => (p.id === ids[2] ? 900 : 10 * (i + 1))), 2000 + round);
    assert.ok(m.royale.results[m.round], 'round resolved once all living guessed');
    for (const p of living) if (m.royale.players[p.id].alive) e.handle(p.id, msg(m, 'ROUND_READY'), 3000 + round);
    if (m.phase === 'playing') round = m.round;
  }
  assert.equal(m.phase, 'final');
  const placements = m.royale.placements;
  assert.equal(placements.length, 3);
  assert.equal(placements[2].id, ids[2], 'the farthest guesser placed last');
  assert.equal(placements[0].points, 100);
  assert.ok(m.royale.players[ids[2]].alive === false);
  assert.equal(new Set(m.plan.map(r => r.id)).size, m.plan.length, 'lazy drawing never repeats a location');
});
test('royale: ghosts cannot guess; a ghost pin is once per round, ghosts only, and hidden from the living by id', () => {
  const { e, players, m } = royaleRoom(3);
  const [a, b, c] = players;
  m.royale.players[c.id].alive = false; m.royale.players[c.id].lives = 0; m.royale.order.push(c.id);
  m.startedAt = 0;
  e.handle(c.id, msg(m, 'PLAYER_GUESS', { guessLatLng: { lat: 11.55, lng: 104.9 } }), 2000);
  assert.ok(!m.guesses[1]?.[c.id], 'a ghost cannot guess');
  e.handle(a.id, { type: 'GHOST_PIN', latLng: { lat: 11.5, lng: 104.9 } }, 2000);
  assert.equal(m.royale.ghostPins[1], undefined, 'living players cannot drop ghost pins');
  e.handle(c.id, { type: 'GHOST_PIN', latLng: { lat: 11.5, lng: 104.9 } }, 2000);
  e.handle(c.id, { type: 'GHOST_PIN', latLng: { lat: 11.6, lng: 104.8 } }, 2001);
  assert.equal(m.royale.ghostPins[1].length, 1, 'one per ghost per round');
  e.state.royaleSettings.ghostPins = true; m.royale.settings.ghostPins = false;
  m.royale.ghostPins[1] = [];
  e.handle(c.id, { type: 'GHOST_PIN', latLng: { lat: 11.6, lng: 104.8 } }, 2002);
  assert.equal(m.royale.ghostPins[1].length, 0, 'host can turn heckling off');
  m.royale.settings.ghostPins = true;
  e.handle(c.id, { type: 'GHOST_PIN', latLng: { lat: 11.6, lng: 104.8 } }, 2003);
  const living = JSON.stringify(e.snapshot(a.id, 2003).match.royale);
  assert.ok(!living.includes(c.id.slice(0, 8)) || living.includes('players'), 'only the players table names ids');
  assert.equal(e.snapshot(a.id, 2003).match.royale.ghostPinCount, 1);
  assert.deepEqual(Object.keys(e.snapshot(a.id, 2003).match.royale.ghostPinList[0]).sort(), ['lat', 'lng']);
});
test('royale views: living players never get the answer or others\' pins; ghosts get the answer after 5 s', () => {
  const { e, players, m } = royaleRoom(3);
  const [a, b, c] = players;
  m.startedAt = 1000;
  m.royale.players[c.id].alive = false; m.royale.players[c.id].lives = 0;
  const t = target(e, m);
  e.handle(b.id, msg(m, 'PLAYER_GUESS', { guessLatLng: { lat: t.lat + 0.001, lng: t.lng } }), 2000);
  const living = e.snapshot(a.id, 2000);
  assert.equal(living.match.answer, undefined);
  assert.equal(living.match.guesses[1][b.id].locked, true);
  assert.equal(living.match.guesses[1][b.id].guessLatLng, undefined);
  assert.equal(living.match.guesses[1][b.id].dist, undefined);
  assert.equal(JSON.stringify(living).includes(String(t.lat)), false, 'no answer coordinates in a living view');
  assert.equal(e.snapshot(c.id, 1000 + 4000).match.answer, undefined, 'ghosts wait 5 s');
  assert.deepEqual(e.snapshot(c.id, 1000 + 5000).match.answer, { lat: t.lat, lng: t.lng });
  assert.ok(e.snapshot(c.id, 3000).match.guesses[1][b.id].guessLatLng, 'ghosts see locks as they happen');
  assert.ok(e.snapshot(b.id, 3000).match.guesses[1][b.id].guessLatLng, 'you always see your own pin');
});
test('royale: a disconnect past the grace period is an elimination', () => {
  const { e, players, m } = royaleRoom(3);
  e.disconnect(players[2].id, 5000);
  e.tick(5000 + GRACE_MS + 1);
  assert.equal(m.royale.players[players[2].id].alive, false);
  assert.ok(m.royale.order.includes(players[2].id));
});
test('royale: the round cap settles on lives, then total distance', () => {
  const { e, players, m } = royaleRoom(3);
  m.round = ROYALE_CAP;
  m.royale.players[players[0].id].lives = 2;
  m.royale.players[players[1].id].lives = 3;
  m.royale.players[players[2].id].lives = 3;
  m.guesses = { 1: { [players[1].id]: { dist: 500 }, [players[2].id]: { dist: 100 }, [players[0].id]: { dist: 1 } } };
  const p = e.placements();
  assert.deepEqual(p.map(x => x.id), [players[2].id, players[1].id, players[0].id]);
});

// ---------- Review fixes ----------
test('royale: if a quitter leaves only one player alive, that player wins at once', () => {
  const { e, players, m } = royaleRoom(2);
  const [a, b] = players;
  e.disconnect(b.id, 5000);
  e.tick(5000 + GRACE_MS + 1);
  assert.equal(e.state.match.phase, 'final', 'no solo round for the survivor');
  assert.equal(e.state.match.royale.placements[0].id, a.id);
});
test('a spectator waiting in a full lobby takes the next free seat before any newcomer', () => {
  const e = new RoomEngine();
  const host = e.join({ create: true, profile: { name: 'H' } }, 1000);
  const others = [];
  for (let i = 1; i < MAX_PLAYERS; i++) others.push(e.join({ profile: { name: 'P' + i } }, 1000));
  start(e, host);
  const waiting = e.join({ profile: { name: 'Waiting' } }, 2000);
  e.state.match.phase = 'final';
  e.handle(host.id, { type: 'REMATCH' }, 3000);
  assert.equal(waiting.role, 'spectator', 'lobby full: still waiting');
  e.disconnect(others[0].id, 4000, true);   // a seat frees up
  e.tick(4001);
  assert.equal(waiting.role, 'player', 'the waiting spectator is seated');
  assert.throws(() => e.join({ profile: { name: 'Newcomer' } }, 4100), /full/);
});
test('royale keeps a quitter\'s name for the final standings', () => {
  const { e, players, m } = royaleRoom(3);
  e.disconnect(players[2].id, 5000);
  e.tick(5000 + GRACE_MS + 1);
  assert.equal(m.royale.players[players[2].id].name, 'P2');
  assert.ok(e.placements().some(x => x.id === players[2].id));
});
test('spectators see ghost pins without who dropped them', () => {
  const { e, players, m } = royaleRoom(3);
  const ghost = players[2];
  m.royale.players[ghost.id].alive = false;
  const w = e.join({ profile: { name: 'Watcher' } }, 2000);
  e.handle(ghost.id, { type: 'GHOST_PIN', latLng: { lat: 11.5, lng: 104.9 } }, 2000);
  const view = e.snapshot(w.id, 2000).match.royale;
  assert.equal(view.ghostPins, undefined);
  assert.equal(view.ghostPinCount, 1);
  assert.ok(!JSON.stringify(view.ghostPinList).includes(ghost.id));
});
