import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RoomEngine } from '../src/room-engine.js';
import { locationById } from '../src/lookup.js';
import { updateRating } from '../src/rating.js';

function room({ link = true } = {}) {
  const e = new RoomEngine();
  const a = e.join({ create: true, mode: 'classic', profile: { name: 'A' } }, 1000);
  const b = e.join({ profile: { name: 'B' } }, 1000);
  if (link) { a.deviceId = 'dev-a'; b.deviceId = 'dev-b'; }
  return { e, a, b };
}
const msg = (m, type, extra = {}) => ({ type, matchId: m.id, round: m.round, ...extra });

test('ranked toggle: host only, ranked modes only, Royale/Tag-Team rejected', () => {
  const { e, a, b } = room();
  e.handle(b.id, { type: 'SET_RANKED', value: true });
  assert.equal(e.state.ranked, false);
  e.handle(a.id, { type: 'SET_MODE', mode: 'royale' });
  e.handle(a.id, { type: 'SET_RANKED', value: true });
  assert.equal(e.state.ranked, true);
  for (const bad of ['royale', 'royale_world', 'tagteam_kh', 'district']) { e.handle(a.id, { type: 'SET_MODE', mode: bad }); assert.notEqual(e.state.mode, bad); }
  e.handle(a.id, { type: 'SET_MODE', mode: 'sprint' });
  assert.equal(e.state.mode, 'sprint');
});

test('ranked: unlinked players block the start and are named', () => {
  const { e, a, b } = room({ link: false });
  a.deviceId = 'dev-a';
  e.handle(a.id, { type: 'SET_RANKED', value: true });
  const out = e.handle(a.id, { type: 'START_MATCH' }, 1100);
  assert.equal(out.notice, 'RANKED_UNLINKED');
  assert.deepEqual(out.names, ['B']);
  assert.equal(e.state.match, null);
  b.deviceId = 'dev-b';
  e.handle(a.id, { type: 'START_MATCH' }, 1200);
  assert.ok(e.state.match.ranked);
});

test('ranked: skip is off and spectators never get the answer early', () => {
  const { e, a } = room();
  e.handle(a.id, { type: 'SET_SPECTATOR_ANSWER', value: true });
  e.handle(a.id, { type: 'SET_RANKED', value: true });
  assert.equal(e.state.spectatorsSeeAnswer, false);
  e.handle(a.id, { type: 'SET_SPECTATOR_ANSWER', value: true });
  assert.equal(e.state.spectatorsSeeAnswer, false);
  e.handle(a.id, { type: 'START_MATCH' }, 1100);
  const m = e.state.match, first = m.plan[0].id;
  e.handle(a.id, { type: 'SKIP_LOCATION' }, 1200);
  assert.equal(m.plan[0].id, first);
});

test('ranked: score and performance come from server guesses; a quitter keeps 0s and the device ids stay private', () => {
  const { e, a, b } = room();
  e.handle(a.id, { type: 'SET_RANKED', value: true });
  e.handle(a.id, { type: 'START_MATCH' }, 1100);
  const m = e.state.match, t = locationById(m.plan[0].id);
  e.handle(a.id, msg(m, 'PLAYER_GUESS', { guessLatLng: t }), m.startedAt + 500);
  e.disconnect(b.id, m.startedAt + 600, true); // b rage-quits
  const ra = e.rankedScore(a.id), rb = e.rankedScore(b.id);
  assert.ok(ra.score > 5000 && ra.performance > 0 && ra.performance <= 1);
  assert.equal(rb.score, 0);
  assert.equal(rb.performance, 0);
  assert.ok(updateRating(1000, 0, ra.performance).delta > updateRating(1000, 0, rb.performance).delta);
  assert.equal(e.state.match.ranked.players.length, 2, 'the quitter is still a ranked participant');
  assert.ok(!JSON.stringify(e.snapshot(a.id)).includes('dev-'));
});

test('review fix: standings treat a locked rival pin as "still guessing", not NaN', async () => {
  const { renderStandings } = await import('../client/ui/standings.js');
  const deps = { esc: x => String(x), avatar: () => '', t: k => k, fmtDist: d => d + 'm' };
  const rows = [
    { id: 'a', name: 'A', isMe: true, total: 0, guess: { dist: 10, score: 4900 } },
    { id: 'b', name: 'B', isMe: false, total: 0, guess: { playerId: 'b', round: 1, elapsed: 3, locked: true } }
  ];
  const html = renderStandings({ rows, tab: 'round', deps });
  assert.doesNotMatch(html, /NaN|undefined/);
  assert.match(html, /result\.stillGuessing/);
});

test('ranked: the next round id is not released during the result screen', () => {
  for (const ranked of [false, true]) {
    const { e, a, b } = room();
    if (ranked) e.handle(a.id, { type: 'SET_RANKED', value: true });
    e.handle(a.id, { type: 'START_MATCH' }, 1100);
    const m = e.state.match;
    for (const p of [a, b]) e.handle(p.id, msg(m, 'PLAYER_GUESS', { guessLatLng: { lat: 11.55, lng: 104.9 } }), 3000);
    const next = e.snapshot(a.id, 3100).match.plan[1];
    assert.equal(next.redacted === true, ranked);
  }
});
