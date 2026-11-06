// Shared scoring rules. The party engine and ranked solo runs both use these,
// so a point is worth the same everywhere.

export function distance(a, b) {
  const rad = Math.PI / 180;
  const t = Math.sin((b.lat - a.lat) * rad / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin((b.lng - a.lng) * rad / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(t), Math.sqrt(Math.max(0, 1 - t)));
}

export function distanceScore(cfg, dist) {
  if (dist === null) return 0;
  if (cfg.pool === 'countries' || cfg.isWorld) return dist <= 50000 ? 5000 : Math.round(5000 * Math.exp(-dist / 3500000));
  if (cfg.pool === 'asia' || cfg.isAsia) return dist <= 25000 ? 5000 : Math.round(5000 * Math.exp(-dist / 1200000));
  if (cfg.pool === 'cambodia') return dist <= 500 ? 5000 : Math.round(5000 * Math.exp(-dist / 30000));
  if (cfg.isSniper) return dist <= 35 ? 10000 : dist <= 75 ? 7500 : dist <= 150 ? 6000 : Math.round(5000 * Math.exp(-dist / 1500));
  return dist <= 25 ? 5000 : Math.round(5000 * Math.exp(-dist / 1500));
}

// `dist` is null when the player did not place a pin.
export function scoreRound(mode, cfg, dist, elapsed) {
  const distScore = distanceScore(cfg, dist);
  const speedBonus = dist !== null ? Math.round(Math.max(0, 1 - elapsed / cfg.time) * 1000) * (mode === 'sprint' ? 2 : 1) : 0;
  const bountyBonus = cfg.isBounty && dist !== null && dist < 200 ? 500 : 0;
  return { distScore, speedBonus, bountyBonus, score: distScore + speedBonus + bountyBonus };
}

// The best score one round can give; used to turn a run into a 0..1 performance.
export function maxRoundScore(mode, cfg) {
  return distanceScore(cfg, 0) + 1000 * (mode === 'sprint' ? 2 : 1) + (cfg.isBounty ? 500 : 0);
}
