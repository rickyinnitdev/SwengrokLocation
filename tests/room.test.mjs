import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RoomEngine, GRACE_MS } from '../src/room-engine.js';
import { locations } from '../.generated/game-data.js';

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
  assert.throws(() => e.join({}), /started/);
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
