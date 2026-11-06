import { locations } from '../.generated/game-data.js';

export function poolFor(cfg) {
  const p = cfg?.pool;
  if (p === 'landmarks') return locations.landmarks;
  if (p === 'countries') return locations.countries || [];
  if (p === 'cambodia') return locations.cambodia || [];
  if (p === 'asia') return locations.asia || [];
  return [...locations.landmarks, ...locations.classic];
}

export function poolKeyFor(cfg) {
  const p = cfg?.pool;
  return (p === 'landmarks' || p === 'countries' || p === 'cambodia' || p === 'asia') ? p : 'all';
}
