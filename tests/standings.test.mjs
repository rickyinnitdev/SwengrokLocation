import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sortByRoundPoints, sortByTotal, sortByDistance, positionChange, previousOrderFrom, renderStandings } from '../client/ui/standings.js';

const g = (dist, elapsed, score) => ({ dist, elapsed, score });
test('round sort: points desc, then distance, then time; no-guess last', () => {
  const rows = [
    { id: 'far-fast', guess: g(900, 3, 4600) },
    { id: 'close-slow', guess: g(300, 50, 4400) },      // closer but fewer points (speed bonus)
    { id: 'tie-near', guess: g(100, 20, 4000) },
    { id: 'tie-far', guess: g(200, 5, 4000) },
    { id: 'tie-far-slow', guess: g(200, 9, 4000) },
    { id: 'none', guess: null },
    { id: 'timeout', guess: g(null, 60, 0) }
  ];
  assert.deepEqual(sortByRoundPoints(rows).map(r => r.id), ['far-fast', 'close-slow', 'tie-near', 'tie-far', 'tie-far-slow', 'none', 'timeout']);
  assert.deepEqual(sortByDistance(rows).slice(0, 3).map(r => r.id), ['tie-near', 'tie-far', 'tie-far-slow']);
});
test('overall sort and position changes', () => {
  const rows = [
    { id: 'a', total: 5000, guess: g(1, 1, 1000) },
    { id: 'b', total: 5200, guess: g(1, 1, 3000) },
    { id: 'c', total: 4000, guess: g(1, 1, 500) }
  ];
  const prev = previousOrderFrom(rows);            // before this round: a 4000, b 2200, c 3500
  assert.deepEqual(prev, ['a', 'c', 'b']);
  const now = sortByTotal(rows).map(r => r.id);
  assert.deepEqual(now, ['b', 'a', 'c']);
  assert.equal(positionChange('b', 0, prev), 2);   // up 2
  assert.equal(positionChange('c', 2, prev), -1);  // down 1
  assert.equal(positionChange('a', 1, prev), -1); // a was first, now second
  assert.equal(positionChange('a', 0, null), 0);
});
const deps = { esc: s => String(s), avatar: () => '', t: k => k, fmtDist: d => d + 'm' };
test('component: podium for the top three, "no guess" rows at the bottom, my row highlighted', () => {
  const rows = ['a', 'b', 'c', 'd', 'e'].map((id, i) => ({ id, name: id, isMe: id === 'c', total: 0, guess: id === 'e' ? null : g(10 * i, 5, 4000 - i * 100) }));
  const html = renderStandings({ rows, tab: 'round', deps });
  assert.match(html, /st-podium/);
  assert.equal((html.match(/st-step /g) || []).length, 3);
  assert.match(html, /is-me/);
  assert.match(html, /no-guess/);
  assert.ok(html.indexOf('data-player="d"') < html.indexOf('data-player="e"'));
  assert.doesNotMatch(renderStandings({ rows: rows.slice(0, 2), tab: 'round', deps }), /st-podium/);
});
