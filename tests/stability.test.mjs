import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RoomEngine, GRACE_MS, GRACE_MATCH_MS, AUTO_ADVANCE_MS } from '../src/room-engine.js';
import { locationById } from '../src/lookup.js';

function room(n = 2, mode = 'classic') {
  const e = new RoomEngine();
  const ps = [e.join({ create: true, mode, profile: { name: 'P0' } }, 1000)];
  for (let i = 1; i < n; i++) ps.push(e.join({ profile: { name: 'P' + i } }, 1000));
  return { e, ps };
}
const go = (e, host) => { e.handle(host.id, { type: 'START_MATCH' }, 1000); return e.state.match; };
const msg = (m, type, extra = {}) => ({ type, matchId: m.id, round: m.round, ...extra });

test('C1: grace is 30 s in the lobby and 60 s during a match', () => {
  const { e, ps } = room();
  e.disconnect(ps[1].id, 2000);
  e.tick(2000 + GRACE_MS + 1);
  assert.equal(e.state.players.length, 1);
  const r = room();
  const m = go(r.e, r.ps[0]);
  r.e.disconnect(r.ps[1].id, 2000);
  r.e.tick(2000 + GRACE_MS + 1);
  assert.equal(r.e.state.players.length, 2);
  r.e.tick(2000 + GRACE_MATCH_MS + 1);
  assert.equal(r.e.state.players.length, 1);
  assert.ok(m);
});

test('C4: lobby host hands over at once and gets the role back on return', () => {
  const { e, ps } = room();
  e.disconnect(ps[0].id, 2000);
  assert.equal(e.state.hostId, ps[1].id);
  e.join({ token: ps[0].token }, 3000);
  e.tick(3000);
  assert.equal(e.state.hostId, ps[0].id);
});

test('S1: a disconnected player does not block the next round', () => {
  const { e, ps } = room(3);
  const m = go(e, ps[0]);
  const t = locationById(m.plan[0].id);
  for (const p of ps) e.handle(p.id, msg(m, 'PLAYER_GUESS', { guessLatLng: t }), m.startedAt + 1000);
  e.disconnect(ps[2].id, m.startedAt + 1500);
  e.handle(ps[0].id, msg(m, 'ROUND_READY'), m.startedAt + 2000);
  e.handle(ps[1].id, msg(m, 'ROUND_READY'), m.startedAt + 2000);
  assert.equal(m.round, 2);
});

test('S1: the round advances by itself 8 s after the reveal', () => {
  const { e, ps } = room();
  const m = go(e, ps[0]);
  const t = locationById(m.plan[0].id);
  for (const p of ps) e.handle(p.id, msg(m, 'PLAYER_GUESS', { guessLatLng: t }), m.startedAt + 1000);
  e.tick(m.startedAt + 1000 + AUTO_ADVANCE_MS - 1);
  assert.equal(m.round, 1);
  assert.ok(e.nextAlarm(m.startedAt + 1000) <= m.startedAt + 1000 + AUTO_ADVANCE_MS + 1);
  e.tick(m.startedAt + 1000 + AUTO_ADVANCE_MS + 1);
  assert.equal(e.state.match.round, 2);
});

test('S2: Start explains itself when a player is away', () => {
  const { e, ps } = room(3);
  e.disconnect(ps[2].id, 2000);
  const out = e.handle(ps[0].id, { type: 'START_MATCH' }, 2100);
  assert.equal(out?.notice, 'PLAYER_AWAY');
  assert.equal(e.state.match, null);
});

test('S4: Tag-Team roles stay fixed when a teammate drops and returns mid-round', () => {
  const e = new RoomEngine();
  const ps = [];
  for (let i = 0; i < 4; i++) ps.push(e.join({ create: i === 0, mode: 'tagteam_kh', profile: { name: 'P' + i } }, 1000));
  const m = go(e, ps[0]);
  const before = { ...m.roles };
  const team = e.teamFor(ps[0].id), [x, y] = team.playerIds;
  const viewer = before[x] === 'viewer' ? x : y, pinner = viewer === x ? y : x;
  e.disconnect(viewer, m.startedAt + 100);
  e.join({ token: ps.find(p => p.id === viewer).token }, m.startedAt + 200);
  e.tick(m.startedAt + 300);
  assert.deepEqual(m.roles, before);
  e.disconnect(pinner, m.startedAt + 400);
  assert.equal(m.roles[viewer], 'both', 'with the Pinner gone the viewer takes over');
});

test('A1/A2: no future ids and no rival pins before the reveal', () => {
  const { e, ps } = room(2);
  const m = go(e, ps[0]);
  const t = locationById(m.plan[0].id);
  const snap = e.snapshot(ps[1].id);
  assert.ok(snap.match.plan.slice(1).every(r => r.id === null && r.redacted));
  e.handle(ps[0].id, msg(m, 'PLAYER_GUESS', { guessLatLng: { lat: t.lat + 1, lng: t.lng } }), m.startedAt + 1000);
  const mine = e.snapshot(ps[0].id).match.guesses[1][ps[0].id];
  const theirs = e.snapshot(ps[1].id).match.guesses[1][ps[0].id];
  assert.ok(mine.guessLatLng && mine.score >= 0);
  assert.deepEqual(Object.keys(theirs).sort(), ['elapsed', 'locked', 'playerId', 'round']);
  e.handle(ps[1].id, msg(m, 'PLAYER_GUESS', { guessLatLng: t }), m.startedAt + 1200);
  const after = e.snapshot(ps[1].id).match;
  assert.ok(after.guesses[1][ps[0].id].guessLatLng);
  assert.ok(after.plan[1].id, 'next spot is released for preloading once revealed');
  assert.equal(after.plan[2].id, null);
});

test('L2: location lookup is a map', () => {
  assert.equal(locationById('nope'), null);
});
