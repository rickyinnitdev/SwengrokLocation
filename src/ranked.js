import { DurableObject } from 'cloudflare:workers';
import { locations, modes } from '../.generated/game-data.js';
import { drawLocations } from './location-rotation.js';
import { distance, scoreRound, maxRoundScore } from './scoring.js';
import { poolFor, poolKeyFor } from './pools.js';
import { recordRun, HttpError } from './leaderboard.js';

const HEAD_START_MS = 800;       // time to load the panorama before the clock runs
const LATE_GRACE_MS = 1500;      // network slack after the round deadline
const STARTS_PER_HOUR = 30;
const RESULT_TTL_MS = 30 * 60 * 1000;

export function rankedModeIds() {
  return Object.entries(modes).filter(([, cfg]) => cfg.ranked).map(([id]) => id);
}

function randomHeading() {
  return crypto.getRandomValues(new Uint32Array(1))[0] % 360;
}

function publicRound(run) {
  return { round: run.round, startedAt: run.roundStartedAt, deadline: run.deadline, serverNow: Date.now() };
}

// One object per device: it owns that player's current ranked run, so scores,
// deadlines and the start rate limit are decided here and never by the browser.
export class RankedPlayer extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.env = env;
  }

  async fetch(request) {
    const body = await request.json();
    const action = new URL(request.url).pathname.slice(1);
    try {
      let out;
      if (action === 'start') out = await this.start(body);
      else if (action === 'guess') out = await this.guess(body);
      else if (action === 'next') out = await this.next();
      else throw new HttpError(404, 'Unknown action.');
      return Response.json(out);
    } catch (e) {
      if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
      throw e;
    }
  }

  async start({ mode, playerId, name }, now = Date.now()) {
    const cfg = modes[mode];
    if (!cfg?.ranked) throw new HttpError(400, 'That mode is not ranked.');
    const recent = ((await this.ctx.storage.get('starts')) || []).filter(t => now - t < 3600 * 1000);
    if (recent.length >= STARTS_PER_HOUR) throw new HttpError(429, 'Too many ranked runs. Try again later.');
    recent.push(now);
    await this.ctx.storage.put('starts', recent);

    const picks = drawLocations(poolFor(cfg), cfg.rounds, { history: [] }, poolKeyFor(cfg));
    const run = {
      id: crypto.randomUUID(), playerId, name, mode, region: cfg.region,
      plan: picks.map(l => ({ id: l.id, heading: randomHeading() })),
      round: 1, phase: 'playing', results: [], total: 0,
      roundStartedAt: now + HEAD_START_MS, deadline: now + HEAD_START_MS + cfg.time * 1000, createdAt: now
    };
    await this.ctx.storage.put('run', run);
    return { runId: run.id, mode, rounds: cfg.rounds, time: cfg.time, plan: run.plan, ...publicRound(run) };
  }

  async guess({ round, guessLatLng }, now = Date.now()) {
    const run = await this.ctx.storage.get('run');
    if (!run || run.phase !== 'playing') throw new HttpError(409, 'No round is waiting for a guess.');
    if (round !== run.round) throw new HttpError(409, 'That round is not active.');
    const cfg = modes[run.mode];
    const valid = guessLatLng && Number.isFinite(guessLatLng.lat) && Number.isFinite(guessLatLng.lng)
      && Math.abs(guessLatLng.lat) <= 90 && Math.abs(guessLatLng.lng) <= 180
      && now >= run.roundStartedAt && now <= run.deadline + LATE_GRACE_MS;
    const point = valid ? { lat: guessLatLng.lat, lng: guessLatLng.lng } : null;
    const target = Object.values(locations).flat().find(l => l.id === run.plan[run.round - 1].id);
    const dist = point ? distance(target, point) : null;
    const elapsed = Math.max(0, Math.min(cfg.time, (now - run.roundStartedAt) / 1000));
    const scored = scoreRound(run.mode, cfg, dist, elapsed);
    run.results.push({ round: run.round, dist, elapsed, ...scored });
    run.total += scored.score;
    const result = { round: run.round, dist, elapsed, ...scored, total: run.total, targetId: target.id, guessLatLng: point };

    if (run.round >= cfg.rounds) {
      run.phase = 'done';
      run.expiresAt = now + RESULT_TTL_MS;
      const best = maxRoundScore(run.mode, cfg) * cfg.rounds;
      let rating = null;
      if (this.env.DB) {
        rating = await recordRun(this.env.DB, {
          playerId: run.playerId, mode: run.mode, region: run.region, score: run.total, rounds: cfg.rounds,
          performance: run.total / best, ranked: true
        }, now);
      }
      await this.ctx.storage.put('run', run);
      return { ...result, done: true, rating, leaderboard: !!this.env.DB };
    }
    run.phase = 'between';
    await this.ctx.storage.put('run', run);
    return { ...result, done: false };
  }

  // The next round's clock starts only when the player asks for it, so reading
  // the result screen never eats into their time.
  async next(now = Date.now()) {
    const run = await this.ctx.storage.get('run');
    if (!run || run.phase !== 'between') throw new HttpError(409, 'No next round is waiting.');
    const cfg = modes[run.mode];
    run.round += 1;
    run.phase = 'playing';
    run.roundStartedAt = now + HEAD_START_MS;
    run.deadline = run.roundStartedAt + cfg.time * 1000;
    await this.ctx.storage.put('run', run);
    return publicRound(run);
  }
}
