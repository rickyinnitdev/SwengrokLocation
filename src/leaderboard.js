import { ensureSchema } from './schema.js';
import { START_RATING, tierFor, nextTier, updateRating, weekKey } from './rating.js';

export const BOARD_SIZE = 50;
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SECRET_RE = /^[0-9a-f]{32,64}$/;
const BLOCKED = ['fuck', 'shit', 'bitch', 'cunt', 'dick', 'nigg', 'porn', 'rape', 'nazi', 'hitler'];
// TODO(km-review): add Khmer profanity once a native speaker supplies the list.

export function cleanName(name) {
  const text = typeof name === 'string' ? name.replace(/[<>\x00-\x1f\x7f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 20) : '';
  if (!text) return 'Explorer';
  const flat = text.toLowerCase().replace(/[^a-z]/g, '');
  return BLOCKED.some(w => flat.includes(w)) ? 'Explorer' : text;
}

export function validIdentity(id, secret) {
  return typeof id === 'string' && typeof secret === 'string' && ID_RE.test(id) && SECRET_RE.test(secret);
}

async function sha256(text) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// Registers a new device or checks the secret of a known one. Returns the stored name.
export async function authenticate(db, { playerId, secret, name, restore }, now = Date.now()) {
  if (!validIdentity(playerId, secret)) throw new HttpError(400, 'Invalid player identity.');
  await ensureSchema(db);
  const hash = await sha256(secret);
  const row = await db.prepare('SELECT secret_hash, name FROM players WHERE id = ?1').bind(playerId).first();
  const display = cleanName(name);
  if (!row && restore) throw new HttpError(404, 'No player matches that backup code.');
  if (!row) {
    await db.prepare('INSERT INTO players (id, secret_hash, name, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?4)').bind(playerId, hash, display, now).run();
    return display;
  }
  if (row.secret_hash !== hash) throw new HttpError(403, 'This device identity does not match.');
  if (name && row.name !== display) await db.prepare('UPDATE players SET name = ?2, updated_at = ?3 WHERE id = ?1').bind(playerId, display, now).run();
  return name ? display : row.name;
}

// Board responses are cached for a minute. The key holds only what changes the
// answer, so a finished run can drop exactly the boards it affects.
export function boardCacheKey({ type, mode, period, region }, now = Date.now()) {
  const q = type === 'rating' ? { type, region } : { type, mode, period, week: period === 'week' ? weekKey(now) : '' };
  return new Request('https://leaderboard.invalid/__lb?' + new URLSearchParams(q));
}

async function invalidateBoards(mode, region, ranked, now) {
  if (typeof caches === 'undefined' || !caches.default) return;
  const keys = [];
  for (const m of mode.startsWith('party:') ? [mode, 'party'] : [mode]) {
    for (const period of ['week', 'all']) keys.push(boardCacheKey({ type: 'score', mode: m, period }, now));
  }
  if (ranked) keys.push(boardCacheKey({ type: 'rating', region }, now));
  await Promise.all(keys.map(key => caches.default.delete(key).catch(() => {})));
}

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export async function getRatings(db, playerId) {
  await ensureSchema(db);
  const { results } = await db.prepare('SELECT region, rating, games FROM ratings WHERE player_id = ?1').bind(playerId).all();
  const out = {};
  for (const region of ['kh', 'world']) {
    const row = results.find(r => r.region === region);
    const rating = row ? row.rating : START_RATING;
    const tier = tierFor(rating), up = nextTier(rating);
    out[region] = { rating, games: row ? row.games : 0, tier: tier.id, tierMin: Number.isFinite(tier.min) ? tier.min : 0, next: up ? { id: up.id, min: up.min } : null };
  }
  return out;
}

// Stores a finished run. Ranked runs also move the player's rating.
export async function recordRun(db, { playerId, mode, region, score, rounds, performance, ranked }, now = Date.now()) {
  await ensureSchema(db);
  const statements = [db.prepare('INSERT INTO runs (id, player_id, mode, region, score, rounds, created_at, week) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)')
    .bind(crypto.randomUUID(), playerId, mode, region, score, rounds, now, weekKey(now))];
  let result = null;
  if (ranked) {
    const row = await db.prepare('SELECT rating, games FROM ratings WHERE player_id = ?1 AND region = ?2').bind(playerId, region).first();
    const before = row ? row.rating : START_RATING, games = row ? row.games : 0;
    const next = updateRating(before, games, performance);
    statements.push(db.prepare('INSERT INTO ratings (player_id, region, rating, games) VALUES (?1, ?2, ?3, 1) ON CONFLICT(player_id, region) DO UPDATE SET rating = ?3, games = games + 1').bind(playerId, region, next.rating));
    result = { before, after: next.rating, delta: next.delta, games: games + 1, tier: tierFor(next.rating).id };
  }
  await db.batch(statements);
  await invalidateBoards(mode, region, ranked, now);
  return result;
}

function scoreWhere(mode, period, now) {
  const clauses = [], binds = [];
  if (mode === 'party') clauses.push("mode LIKE 'party:%'");
  else { clauses.push(`mode = ?${binds.length + 1}`); binds.push(mode); }
  if (period === 'week') { clauses.push(`week = ?${binds.length + 1}`); binds.push(weekKey(now)); }
  return { where: clauses.join(' AND '), binds };
}

// Top players for a board, one entry per player (their best). `playerId` is
// returned only as an internal key; callers must turn it into an isMe flag.
export async function topBoard(db, { type, mode, period, region }, now = Date.now()) {
  await ensureSchema(db);
  if (type === 'rating') {
    const { results } = await db.prepare('SELECT p.id AS playerId, p.name AS name, r.rating AS value, r.games AS games FROM ratings r JOIN players p ON p.id = r.player_id WHERE r.region = ?1 AND r.games > 0 ORDER BY r.rating DESC, p.id LIMIT ?2').bind(region, BOARD_SIZE).all();
    return results.map((row, i) => ({ rank: i + 1, ...row, tier: tierFor(row.value).id }));
  }
  const { where, binds } = scoreWhere(mode, period, now);
  const { results } = await db.prepare(`SELECT p.id AS playerId, p.name AS name, b.best AS value FROM (SELECT player_id, MAX(score) AS best FROM runs WHERE ${where} GROUP BY player_id ORDER BY best DESC, player_id LIMIT ${BOARD_SIZE}) b JOIN players p ON p.id = b.player_id ORDER BY b.best DESC, p.id`).bind(...binds).all();
  return results.map((row, i) => ({ rank: i + 1, ...row }));
}

export async function myStanding(db, playerId, { type, mode, period, region }, now = Date.now()) {
  await ensureSchema(db);
  if (type === 'rating') {
    const mine = await db.prepare('SELECT rating, games FROM ratings WHERE player_id = ?1 AND region = ?2').bind(playerId, region).first();
    if (!mine || !mine.games) return null;
    const ahead = await db.prepare('SELECT COUNT(*) AS c FROM ratings WHERE region = ?1 AND games > 0 AND rating > ?2').bind(region, mine.rating).first();
    return { rank: ahead.c + 1, value: mine.rating, games: mine.games, tier: tierFor(mine.rating).id };
  }
  const { where, binds } = scoreWhere(mode, period, now);
  const mine = await db.prepare(`SELECT MAX(score) AS best FROM runs WHERE ${where} AND player_id = ?${binds.length + 1}`).bind(...binds, playerId).first();
  if (!mine || mine.best === null) return null;
  const ahead = await db.prepare(`SELECT COUNT(*) AS c FROM (SELECT player_id FROM runs WHERE ${where} GROUP BY player_id HAVING MAX(score) > ?${binds.length + 1})`).bind(...binds, mine.best).first();
  return { rank: ahead.c + 1, value: mine.best };
}
