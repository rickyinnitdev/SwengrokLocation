import { test, expect } from '@playwright/test';
import { randomUUID, randomBytes } from 'node:crypto';

const ORIGIN = 'http://127.0.0.1:4173';
const device = () => ({ playerId: randomUUID(), secret: randomBytes(16).toString('hex') });

async function api(ctx, path, body, headers = {}) {
  const res = await ctx.post(path, { data: body, headers: { Origin: ORIGIN, ...headers } });
  return { status: res.status(), body: await res.json().catch(() => null) };
}

// Plays a whole run by "knowing" every answer. The answers come from the page's
// own location table, like a player who recognised each street.
async function playRun(ctx, page, me, mode, { perfect = true } = {}) {
  const start = await api(ctx, '/api/ranked/start', { ...me, name: 'API Tester', mode });
  expect(start.status).toBe(200);
  const spots = await page.evaluate(plan => {
    const all = [...ALL_LOCATIONS, ...LOCATIONS_DB.countries, ...LOCATIONS_DB.cambodia, ...(LOCATIONS_DB.asia || [])];
    return plan.map(p => { const l = all.find(x => x.id === p.id); return { lat: l.lat, lng: l.lng }; });
  }, start.body.plan);
  let last;
  for (let round = 1; round <= start.body.rounds; round++) {
    if (round > 1) expect((await api(ctx, '/api/ranked/next', me)).status).toBe(200);
    await page.waitForTimeout(perfect ? 900 : 0);
    const spot = spots[round - 1];
    last = await api(ctx, '/api/ranked/guess', { ...me, round, guessLatLng: perfect ? spot : { lat: spot.lat + 5, lng: spot.lng + 5 } });
    expect(last.status).toBe(200);
  }
  return { start: start.body, last: last.body };
}

test('ranked: server scores a full run, rates the player and lists them', async ({ page, playwright }) => {
  await page.goto('/');
  const ctx = await playwright.request.newContext({ baseURL: ORIGIN });
  const me = device();
  // Prime the cached boards first: a finished run must still show up at once.
  for (const period of ['week', 'all']) await ctx.get(`/api/leaderboard?mode=classic&period=${period}&region=kh`);
  await ctx.get('/api/leaderboard?type=rating&region=kh');
  const { last } = await playRun(ctx, page, me, 'classic');
  expect(last.done).toBe(true);
  expect(last.total).toBeGreaterThan(25000);
  expect(last.rating.after).toBeGreaterThan(last.rating.before);
  expect(last.rating.games).toBe(1);

  const profile = await api(ctx, '/api/me', { ...me, name: 'API Tester' });
  expect(profile.body.ratings.kh.rating).toBe(last.rating.after);
  expect(profile.body.ratings.world.games).toBe(0);

  const q = `/api/leaderboard?mode=classic&period=week&region=kh&playerId=${me.playerId}`;
  const board = await (await ctx.get(q)).json();
  expect(board.rows.find(r => r.isMe)).toMatchObject({ name: 'API Tester', value: last.total });
  expect(board.rows.every(r => r.playerId === undefined)).toBe(true);
  expect(board.me.rank).toBeGreaterThan(0);
  const all = await (await ctx.get('/api/leaderboard?mode=classic&period=all&region=kh')).json();
  expect(all.rows.length).toBeGreaterThan(0);
  const ratings = await (await ctx.get(`/api/leaderboard?type=rating&region=kh&playerId=${me.playerId}`)).json();
  expect(ratings.rows.find(r => r.isMe)?.value).toBe(last.rating.after);
  expect(ratings.rows.find(r => r.isMe)?.tier).toBeTruthy();
  await ctx.dispose();
});

test('ranked: cheating and bad input are refused', async ({ page, playwright }) => {
  await page.goto('/');
  const ctx = await playwright.request.newContext({ baseURL: ORIGIN });
  const me = device();
  expect((await api(ctx, '/api/ranked/start', { ...me, mode: 'country' })).status).toBe(400);
  expect((await api(ctx, '/api/ranked/start', { ...me, mode: 'nope' })).status).toBe(400);
  expect((await api(ctx, '/api/ranked/start', { playerId: 'x', secret: 'y', mode: 'classic' })).status).toBe(400);
  expect((await api(ctx, '/api/ranked/start', { ...me, mode: 'classic' }, { Origin: 'https://evil.example' })).status).toBe(403);
  expect((await ctx.get('/api/ranked/start')).status()).toBe(405);

  const start = await api(ctx, '/api/ranked/start', { ...me, name: 'Cheater', mode: 'classic' });
  expect(start.status).toBe(200);
  // Someone who knows only the player id cannot act as that player.
  expect((await api(ctx, '/api/ranked/guess', { playerId: me.playerId, secret: randomBytes(16).toString('hex'), round: 1, guessLatLng: { lat: 11.5, lng: 104.9 } })).status).toBe(403);
  // Wrong round, impossible coordinates and a second guess for the same round.
  await page.waitForTimeout(900);
  expect((await api(ctx, '/api/ranked/guess', { ...me, round: 2, guessLatLng: { lat: 11.5, lng: 104.9 } })).status).toBe(409);
  const bad = await api(ctx, '/api/ranked/guess', { ...me, round: 1, guessLatLng: { lat: 999, lng: 0 } });
  expect(bad.body.score).toBe(0);
  expect((await api(ctx, '/api/ranked/guess', { ...me, round: 1, guessLatLng: { lat: 11.5, lng: 104.9 } })).status).toBe(409);
  // A round cannot be skipped ahead without asking for it.
  expect((await api(ctx, '/api/ranked/next', me)).status).toBe(200);
  expect((await api(ctx, '/api/ranked/next', me)).status).toBe(409);
  // Starting again abandons the old run; the old run never reaches the board.
  const again = await api(ctx, '/api/ranked/start', { ...me, mode: 'classic' });
  expect(again.body.runId).not.toBe(start.body.runId);
  const board = await (await ctx.get(`/api/leaderboard?mode=classic&period=all&region=kh&playerId=${me.playerId}`)).json();
  expect(board.rows.find(r => r.isMe)).toBeUndefined();
  await ctx.dispose();
});

test('ranked: poor runs lose rating, names are cleaned, unknown boards are rejected', async ({ page, playwright }) => {
  await page.goto('/');
  const ctx = await playwright.request.newContext({ baseURL: ORIGIN });
  const me = device();
  const { last } = await playRun(ctx, page, me, 'sprint', { perfect: false });
  expect(last.rating.delta).toBeLessThan(0);
  const named = await api(ctx, '/api/me', { ...me, name: 'f u c k' });
  expect(named.body.name).toBe('Explorer');
  expect((await ctx.get('/api/leaderboard?mode=country&period=all&region=kh')).status()).toBe(400);
  expect((await ctx.get('/api/leaderboard?mode=bogus')).status()).toBe(400);
  expect((await ctx.get('/api/leaderboard?mode=party&period=all&region=kh')).status()).toBe(200);
  await ctx.dispose();
});
