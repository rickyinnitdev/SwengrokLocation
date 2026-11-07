// Avatar items that must be earned. Shared by the editor (shows 🔒 and the condition) and by the
// server (strips a locked item from a profile when the player has not earned it).
// Unlock keys: tuktuk and legend come from ranked rating tiers, royale from winning Battle Royale.
export const AVATAR_LOCKS = {
  frame: { rankTuk: 'tuktuk', rankLegend: 'legend', royale: 'royale' },
  headwear: { helmetTuk: 'tuktuk', crownGold: 'legend' }
};
export const UNLOCK_LABELS = {
  tuktuk: { en: 'Reach the Tuk-Tuk Driver rank', km: 'ឡើងដល់ថ្នាក់ អ្នកបើកតុកតុក' },
  legend: { en: 'Reach the Legend of Penh rank', km: 'ឡើងដល់ថ្នាក់ វីរបុរសភ្នំពេញ' },
  royale: { en: 'Win a Battle Royale', km: 'ឈ្នះ Battle Royale មួយ' } // either Royale mode counts
};
const TIER_ORDER = ['tourist', 'moto', 'tuktuk', 'guide', 'khan', 'legend'];

// ratings: { kh: { tier }, world: { tier } } as returned by /api/me. Returns the unlock keys earned.
export function unlocksFrom(ratings, royaleWins = 0) {
  const best = Math.max(...Object.values(ratings || {}).map(r => TIER_ORDER.indexOf(r?.tier)), 0);
  const out = [];
  if (best >= TIER_ORDER.indexOf('tuktuk')) out.push('tuktuk');
  if (best >= TIER_ORDER.indexOf('legend')) out.push('legend');
  if (royaleWins > 0) out.push('royale');
  return out;
}
export function isLocked(slot, value, unlocks) {
  const need = AVATAR_LOCKS[slot]?.[value];
  return !!need && !(unlocks || []).includes(need);
}
// Resets locked values to the slot's default. `defaults` is e.g. { frame: 'plain', headwear: 'none' }.
export function stripLocked(config, unlocks, defaults = { frame: 'plain', headwear: 'none' }) {
  const out = { ...config };
  for (const slot of Object.keys(AVATAR_LOCKS)) if (isLocked(slot, out[slot], unlocks)) out[slot] = defaults[slot];
  return out;
}
