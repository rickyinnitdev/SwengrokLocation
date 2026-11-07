// Per-mode map profile: the single source of truth for the first view of the guess map.
// Leaflet is passed in (window.L is loaded lazily), so this module imports nothing heavy.

const PP = {
  bounds: [[11.45, 104.75], [11.75, 105.05]],
  maxBounds: [[11.3, 104.6], [11.9, 105.2]],
  minZoom: 11, maxZoom: 19,
  quickJumps: 'pp-khans',
  overlays: ['khans', 'river', 'landmarks']
};
const PROFILES = {
  pp: PP,
  cambodia: {
    bounds: [[10.4, 102.3], [14.7, 107.7]],
    maxBounds: [[9.2, 101.2], [15.6, 108.8]],
    minZoom: 6, maxZoom: 19,
    quickJumps: 'kh-provinces',
    overlays: ['landmarks']
  },
  asia: {
    bounds: [[-10, 60], [46, 146]],
    maxBounds: [[-25, 40], [60, 160]],
    minZoom: 3, maxZoom: 19,
    quickJumps: 'asia-countries',
    overlays: []
  },
  world: {
    bounds: [[-50, -130], [65, 160]],
    maxBounds: null,
    minZoom: 2, maxZoom: 19,
    quickJumps: 'continents',
    overlays: []
  }
};

// Called once from modes.js for every mode. `keepViewBetweenRounds` defaults to false.
export function profileForMode(cfg) {
  const base = cfg.isWorld || cfg.isCountry ? PROFILES.world
    : cfg.isAsia ? PROFILES.asia
    : cfg.isCambodia ? PROFILES.cambodia
    : PROFILES.pp;
  const map = structuredClone(base);
  // Landmark Blitz: the orientation icons would hand over the answer.
  // The Phnom Penh pools ('all' and 'landmarks') contain the 42 landmark locations, so landmark icons
  // would mark real answers. Lock them off there; Cambodia mode shows city labels instead.
  if (cfg.pool === 'landmarks' || cfg.pool === 'all') { map.lockedOverlays = { landmarks: false }; map.overlays = map.overlays.filter(o => o !== 'landmarks'); }
  // Khan Detective needs the borders; its multiple-choice shelf and the map click select a khan.
  if (cfg.isDistrict) { map.lockedOverlays = { khans: true, landmarks: false }; map.overlays = ['khans', 'river']; }
  if (cfg.isCountry) { map.peek = true; }
  return map;
}

export function applyMapProfile(map, profile, { animate = false } = {}) {
  map.setMinZoom(profile.minZoom);
  map.setMaxZoom(profile.maxZoom);
  map.setMaxBounds(profile.maxBounds || null);
  map.fitBounds(profile.bounds, { animate, padding: [0, 0] });
}

// Initial Leaflet options. Passing bounds here avoids a flash of the wrong view.
export function mapOptions(profile) {
  return {
    zoomControl: false, attributionControl: false,
    minZoom: profile.minZoom, maxZoom: profile.maxZoom,
    maxBounds: profile.maxBounds || undefined, maxBoundsViscosity: 0.8,
    bounds: profile.bounds
  };
}
