// Pure geometry helpers. No Leaflet and no DOM, so Node can unit test them.

// Ray casting on one ring of [lng, lat] pairs.
export function pointInRing(lat, lng, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export function pointInFeature(lat, lng, feature) {
  const g = feature.geometry;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  return polys.some(([outer, ...holes]) => pointInRing(lat, lng, outer) && !holes.some(h => pointInRing(lat, lng, h)));
}
export function khanAt(lat, lng, collection) {
  const hit = collection?.features?.find(f => pointInFeature(lat, lng, f));
  return hit ? hit.properties : null;
}
// Leaflet-style [[south, west], [north, east]] box around a feature.
export function featureBounds(feature) {
  const g = feature.geometry;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  let s = 90, w = 180, n = -90, e = -180;
  for (const [outer] of polys) for (const [lng, lat] of outer) {
    s = Math.min(s, lat); n = Math.max(n, lat); w = Math.min(w, lng); e = Math.max(e, lng);
  }
  return [[s, w], [n, e]];
}
