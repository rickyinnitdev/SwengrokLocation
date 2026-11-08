import { locations } from '../.generated/game-data.js';

// Built once when the module loads, so a guess or snapshot never scans every pool.
const byId = new Map(Object.values(locations).flat().map(l => [l.id, l]));
export const locationById = id => byId.get(id) || null;
export const isKnownLocation = id => byId.has(id);
