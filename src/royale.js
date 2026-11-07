// Battle Royale ("Tuk-Tuk Royale") rules. Pure functions, no I/O, so the server engine and the
// unit tests share them. The server is the only place where lives, zones and eliminations are decided.
import { distance } from './scoring.js';

export const ROYALE_CAP = 30;            // rounds before the match is settled on lives, then total distance
export const ROYALE_MIN_TIME = 20;       // seconds
export const ROYALE_TIME_STEP = 5;       // seconds shaved off every round
export const ZONE_FROM_ROUND = 4;
export const DEFAULT_SETTINGS = { lives: 3, time: 60, ghostPins: true };

// Distances in metres. PP = Phnom Penh pool, WORLD = world pool.
const TIE = { pp: 10, world: 1000 };
const BULLSEYE = { pp: 100, world: 25000 };
const ZONE_START = { pp: 6000, world: 3000000 };
const ZONE_MIN = { pp: 400, world: 100000 };
const kind = world => (world ? 'world' : 'pp');

export function cleanSettings(s = {}) {
  const int = (v, lo, hi, d) => (Number.isInteger(v) ? Math.min(hi, Math.max(lo, v)) : d);
  return { lives: int(s.lives, 1, 5, 3), time: int(s.time, 30, 90, 60), ghostPins: typeof s.ghostPins === 'boolean' ? s.ghostPins : true };
}

export function roundTime(settings, round) {
  return Math.max(ROYALE_MIN_TIME, settings.time - ROYALE_TIME_STEP * (round - 1));
}

export function zoneRadius(round, world) {
  if (round < ZONE_FROM_ROUND) return null;
  const k = kind(world);
  return Math.max(ZONE_MIN[k], ZONE_START[k] / 2 ** (round - ZONE_FROM_ROUND));
}

// The zone must contain the answer without being centred on it, so the centre is a random point
// within 0.6 R of the answer (never closer than 0.05 R). Only {center, radius} is sent to clients.
export function makeZone(target, round, world, random = Math.random) {
  const radius = zoneRadius(round, world);
  if (radius === null) return null;
  const d = Math.max(0.05 * radius, 0.6 * radius * Math.sqrt(random()));
  const angle = random() * 2 * Math.PI;
  // Great-circle destination point, so the 0.6 R bound also holds for the 3,000 km world zone.
  const rad = Math.PI / 180, ang = d / 6371000, lat1 = target.lat * rad, lng1 = target.lng * rad;
  const lat = Math.asin(Math.sin(lat1) * Math.cos(ang) + Math.cos(lat1) * Math.sin(ang) * Math.cos(angle));
  const lng = lng1 + Math.atan2(Math.sin(angle) * Math.sin(ang) * Math.cos(lat1), Math.cos(ang) - Math.sin(lat1) * Math.sin(lat));
  return { center: { lat: lat / rad, lng: ((lng / rad + 540) % 360) - 180 }, radius: Math.round(radius) };
}
export function zoneContains(zone, target) {
  return distance(zone.center, target) <= zone.radius;
}

// alive: [{ id, dist (null = no guess), lives, shield }] -> per-player outcome for this round.
export function resolveRound({ alive, world = false, duel = false }) {
  const k = kind(world);
  const far = e => (e.dist === null || e.dist === undefined ? Infinity : e.dist);
  const same = (a, b) => (a === Infinity && b === Infinity) || (Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= TIE[k]);
  const order = [...alive].sort((a, b) => far(b) - far(a));
  const take = duel ? 1 : alive.length >= 6 ? 2 : 1;
  let losers = order.slice(0, Math.min(take, order.length));
  if (losers.length) {
    // Ties at the bottom all lose a life.
    const edge = far(losers.at(-1));
    for (const e of order.slice(losers.length)) { if (same(far(e), edge)) losers.push(e); else break; }
  }
  // If everybody would lose (everyone tied, or everyone timed out) nobody does.
  if (losers.length >= alive.length) losers = [];
  const lose = new Set(losers.map(e => e.id));
  return alive.map(e => {
    let lives = e.lives, shield = !!e.shield, lostLife = false, shieldBlocked = false, shieldGained = false;
    if (lose.has(e.id)) {
      if (shield) { shield = false; shieldBlocked = true; } else { lives -= 1; lostLife = true; }
    }
    // A bullseye earns a shield for the NEXT hit (one at most).
    if (e.dist !== null && e.dist !== undefined && e.dist <= BULLSEYE[k] && !shield) { shield = true; shieldGained = true; }
    return { id: e.id, lives, shield, lostLife, shieldBlocked, shieldGained, eliminated: lives <= 0 };
  });
}

// 1st = 100, 2nd = 70, 3rd = 50, then 10 less per place, never below 5.
export function placementPoints(place) {
  if (place === 1) return 100;
  if (place === 2) return 70;
  if (place === 3) return 50;
  return Math.max(5, 50 - 10 * (place - 3));
}
