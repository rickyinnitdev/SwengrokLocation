// D1 schema. Created lazily so a fresh deploy works without a manual migration step.
export const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY, secret_hash TEXT NOT NULL, name TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS ratings (player_id TEXT NOT NULL, region TEXT NOT NULL, rating INTEGER NOT NULL DEFAULT 1000, games INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (player_id, region))',
  'CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, player_id TEXT NOT NULL, mode TEXT NOT NULL, region TEXT NOT NULL, score INTEGER NOT NULL, rounds INTEGER NOT NULL, created_at INTEGER NOT NULL, week TEXT NOT NULL)',
  'CREATE INDEX IF NOT EXISTS runs_mode_week_score ON runs(mode, week, score DESC)',
  'CREATE INDEX IF NOT EXISTS runs_mode_score ON runs(mode, score DESC)',
  'CREATE INDEX IF NOT EXISTS runs_player ON runs(player_id, created_at DESC)',
  'CREATE INDEX IF NOT EXISTS ratings_region ON ratings(region, rating DESC)'
];

let ready = null;
export function ensureSchema(db) {
  ready ||= db.batch(SCHEMA.map(sql => db.prepare(sql))).catch(error => { ready = null; throw error; });
  return ready;
}
