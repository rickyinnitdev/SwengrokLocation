import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tierFor, nextTier, updateRating, expectedPerformance, kFactor, weekKey, weekStartMs, TIERS, START_RATING } from '../src/rating.js';
import { distanceScore, scoreRound, maxRoundScore, distance } from '../src/scoring.js';
import { cleanName, validIdentity } from '../src/leaderboard.js';
import { modes, locations } from '../.generated/game-data.js';
import { RoomEngine } from '../src/room-engine.js';

test('tiers follow the rating thresholds', () => {
  assert.equal(tierFor(START_RATING).id, 'moto');
  assert.equal(tierFor(899).id, 'tourist');
  assert.equal(tierFor(900).id, 'moto');
  assert.equal(tierFor(1299).id, 'tuktuk');
  assert.equal(tierFor(1300).id, 'guide');
  assert.equal(tierFor(1699).id, 'khan');
  assert.equal(tierFor(1700).id, 'legend');
  assert.equal(tierFor(5000).id, 'legend');
  assert.equal(nextTier(1700), null);
  assert.equal(nextTier(1000).id, 'tuktuk');
  assert.ok(TIERS.every(t => t.en && t.km));
});

test('rating moves with performance and never drops below the floor', () => {
  const strong = updateRating(1000, 0, 0.9), weak = updateRating(1000, 0, 0.05);
  assert.ok(strong.delta > 0 && weak.delta < 0);
  assert.equal(strong.rating, 1000 + strong.delta);
  assert.ok(expectedPerformance(1400) > expectedPerformance(1000));
  // Beating expectations at a higher rating is worth less than at a low one.
  assert.ok(updateRating(1600, 40, 0.85).delta < updateRating(1000, 40, 0.85).delta);
  assert.equal(updateRating(100, 0, 0).rating, 100);
  // Out-of-range performance is clamped.
  assert.deepEqual(updateRating(1000, 0, 5), updateRating(1000, 0, 1));
  assert.equal(kFactor(0), 32);
  assert.equal(kFactor(30), 20);
});

test('weeks roll over on Monday 00:00 in Phnom Penh', () => {
  // 2026-11-02 is a Monday. Phnom Penh midnight is 17:00 UTC the day before.
  const mondayStart = Date.UTC(2026, 10, 1, 17, 0, 0);
  assert.equal(weekKey(mondayStart), weekKey(mondayStart + 6 * 86400000 + 86399000));
  assert.notEqual(weekKey(mondayStart - 1), weekKey(mondayStart));
  assert.equal(weekStartMs(weekKey(mondayStart + 3 * 86400000)), mondayStart);
});

test('scoring parity: the shared scorer matches the party engine for every ranked mode', () => {
  const ranked = Object.entries(modes).filter(([, cfg]) => cfg.ranked);
  assert.ok(ranked.length >= 9);
  for (const [mode, cfg] of ranked) {
    const e = new RoomEngine();
    const a = e.join({ create: true, mode, profile: { name: 'A' } }, 1000);
    e.join({ profile: { name: 'B' } }, 1000);
    e.handle(a.id, { type: 'START_MATCH' }, 1000);
    const m = e.state.match;
    const target = Object.values((locations)).flat().find(l => l.id === m.plan[0].id);
    for (const offset of [0, 20, 400, 6000, 900000]) {
      const guess = { lat: target.lat + offset / 111000, lng: target.lng };
      const at = m.startedAt + 12500;
      e.state.match.guesses = {};
      e.handle(a.id, { type: 'PLAYER_GUESS', matchId: m.id, round: 1, guessLatLng: guess }, at);
      const got = e.state.match.guesses[1][a.id];
      const want = scoreRound(mode, cfg, distance(target, guess), (at - m.startedAt) / 1000);
      assert.equal(got.score, want.score, `${mode} @ ${offset}m`);
      assert.equal(got.distScore, want.distScore);
    }
  }
});

test('scoring rules: bounty, sprint and max score', () => {
  const classic = modes.classic, sprint = modes.sprint, bounty = modes.bounty;
  assert.equal(distanceScore(classic, null), 0);
  assert.equal(distanceScore(classic, 10), 5000);
  assert.equal(scoreRound('classic', classic, null, 3).score, 0);
  assert.equal(scoreRound('sprint', sprint, 0, 0).speedBonus, 2000);
  assert.equal(scoreRound('bounty', bounty, 150, sprint.time).bountyBonus, 500);
  assert.equal(scoreRound('bounty', bounty, 250, 0).bountyBonus, 0);
  assert.equal(maxRoundScore('classic', classic), 6000);
  assert.equal(maxRoundScore('sprint', sprint), 7000);
  assert.equal(maxRoundScore('bounty', bounty), 6500);
  // A perfect instant guess equals the advertised maximum.
  assert.equal(scoreRound('classic', classic, 0, 0).score, maxRoundScore('classic', classic));
});

test('names are cleaned and identities validated', () => {
  assert.equal(cleanName('  Sokha   <b>Penh</b> '), 'Sokha bPenh/b');
  assert.equal(cleanName('x'.repeat(60)).length, 20);
  assert.equal(cleanName(''), 'Explorer');
  assert.equal(cleanName(null), 'Explorer');
  assert.equal(cleanName('f.u.c.k you'), 'Explorer');
  assert.equal(cleanName('សុខា'), 'សុខា');
  const id = crypto.randomUUID(), secret = 'a'.repeat(32);
  assert.ok(validIdentity(id, secret));
  assert.ok(!validIdentity('nope', secret));
  assert.ok(!validIdentity(id, 'short'));
  assert.ok(!validIdentity(id, 'Z'.repeat(32)));
  assert.ok(!validIdentity(undefined, undefined));
});
