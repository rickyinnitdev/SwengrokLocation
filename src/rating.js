// Ranked ratings. A run's score is turned into a 0..1 performance and compared
// with what a player at that rating is expected to manage.

export const START_RATING = 1000;
export const MIN_RATING = 100;

// Highest tier whose `min` the rating reaches. Khmer names: TODO(km-review).
export const TIERS = [
  { id: 'tourist',  min: -Infinity, en: 'Tourist',        km: 'ភ្ញៀវទេសចរ' },
  { id: 'moto',     min: 900,       en: 'Moto Rider',     km: 'អ្នកជិះម៉ូតូ' },
  { id: 'tuktuk',   min: 1100,      en: 'Tuk-Tuk Driver', km: 'អ្នកបើកតុកតុក' },
  { id: 'guide',    min: 1300,      en: 'City Guide',     km: 'មគ្គុទ្ទេសក៍' },
  { id: 'khan',     min: 1500,      en: 'Khan Master',    km: 'មេខណ្ឌ' },
  { id: 'legend',   min: 1700,      en: 'Legend of Penh', km: 'វីរបុរសភ្នំពេញ' }
];

export function tierFor(rating) {
  let tier = TIERS[0];
  for (const t of TIERS) if (rating >= t.min) tier = t;
  return tier;
}

export function nextTier(rating) {
  return TIERS.find(t => t.min > rating) || null;
}

// What a player at `rating` is expected to score (0..1). 1250 is the midpoint.
export function expectedPerformance(rating) {
  return 1 / (1 + Math.pow(10, (1250 - rating) / 400));
}

export function kFactor(games) {
  return games < 30 ? 32 : 20;
}

// performance: run score / best possible run score, clamped to 0..1.
export function updateRating(rating, games, performance) {
  const perf = Math.min(1, Math.max(0, performance));
  const delta = Math.round(kFactor(games) * (perf - expectedPerformance(rating)));
  const next = Math.max(MIN_RATING, rating + delta);
  return { rating: next, delta: next - rating };
}

// Weeks start Monday 00:00 in Phnom Penh (UTC+7, no daylight saving).
const PP_OFFSET_MS = 7 * 3600 * 1000;
const WEEK_MS = 7 * 24 * 3600 * 1000;
const MONDAY_SHIFT_MS = 4 * 24 * 3600 * 1000; // 1970-01-01 was a Thursday
export function weekKey(ms) {
  return String(Math.floor((ms + PP_OFFSET_MS - MONDAY_SHIFT_MS) / WEEK_MS));
}
export function weekStartMs(key) {
  return Number(key) * WEEK_MS + MONDAY_SHIFT_MS - PP_OFFSET_MS;
}
