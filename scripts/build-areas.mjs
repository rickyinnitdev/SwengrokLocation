// One-off, offline data build: node scripts/build-areas.mjs
// Downloads Phnom Penh khan boundaries from OpenStreetMap (ODbL) through Overpass,
// simplifies them, and writes data/pp-khans.geojson. Commit the output.
import fs from 'node:fs';

const query = `[out:json][timeout:120];
area["name:en"="Phnom Penh"]["boundary"="administrative"]->.pp;
rel(area.pp)["boundary"="administrative"]["admin_level"="6"];
out geom;`;
const res = await fetch('https://overpass-api.de/api/interpreter', {
  method: 'POST', headers: { 'User-Agent': 'WanderPenh-build/1.0', 'Content-Type': 'application/x-www-form-urlencoded' },
  body: 'data=' + encodeURIComponent(query)
});
if (!res.ok) throw new Error('Overpass ' + res.status);
const { elements } = await res.json();

const key = p => `${p.lat.toFixed(7)},${p.lon.toFixed(7)}`;
function assemble(members) {
  // Join outer ways end to end into closed rings.
  const ways = members.filter(m => m.type === 'way' && m.role === 'outer' && m.geometry?.length > 1).map(m => m.geometry.slice());
  const rings = [];
  while (ways.length) {
    let ring = ways.pop();
    let grew = true;
    while (grew && key(ring[0]) !== key(ring.at(-1))) {
      grew = false;
      for (let i = 0; i < ways.length; i++) {
        const w = ways[i];
        if (key(w[0]) === key(ring.at(-1))) ring = ring.concat(w.slice(1));
        else if (key(w.at(-1)) === key(ring.at(-1))) ring = ring.concat(w.slice(0, -1).reverse());
        else if (key(w.at(-1)) === key(ring[0])) ring = w.concat(ring.slice(1));
        else if (key(w[0]) === key(ring[0])) ring = w.slice(1).reverse().concat(ring);
        else continue;
        ways.splice(i, 1); grew = true; break;
      }
    }
    if (key(ring[0]) === key(ring.at(-1)) && ring.length >= 4) rings.push(ring);
  }
  return rings;
}
function dp(points, eps) {
  if (points.length < 3) return points;
  const [a, b] = [points[0], points.at(-1)];
  let max = 0, idx = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = segDist(points[i], a, b);
    if (d > max) { max = d; idx = i; }
  }
  if (max <= eps) return [a, b];
  return dp(points.slice(0, idx + 1), eps).slice(0, -1).concat(dp(points.slice(idx), eps));
}
function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = dx || dy ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy))) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
function centroid(ring) {
  let a = 0, x = 0, y = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const f = ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
    a += f; x += (ring[i][0] + ring[i + 1][0]) * f; y += (ring[i][1] + ring[i + 1][1]) * f;
  }
  return [x / (3 * a), y / (3 * a)];
}
const features = [];
for (const el of elements) {
  const rings = assemble(el.members).map(r => {
    const pts = r.map(p => [+p.lon.toFixed(5), +p.lat.toFixed(5)]);
    const s = dp(pts, 0.0002); // ~20 m
    return s.length >= 4 ? s : null;
  }).filter(Boolean);
  if (!rings.length) { console.warn('No geometry for', el.tags['name:en']); continue; }
  const biggest = rings.reduce((m, r) => (r.length > m.length ? r : m), rings[0]);
  const id = (el.tags['name:en'] || '').replace(/^Khan /, '');
  features.push({
    type: 'Feature',
    properties: { id, name: id, nameKm: el.tags.name.replace(/^ខណ្ឌ/, ''), center: centroid(biggest).map(n => +n.toFixed(5)) },
    geometry: { type: 'MultiPolygon', coordinates: rings.map(r => [r]) }
  });
}
fs.mkdirSync('data', { recursive: true });
const out = JSON.stringify({ type: 'FeatureCollection', features });
fs.writeFileSync('data/pp-khans.geojson', out);
console.log(features.length, 'khans,', (out.length / 1024).toFixed(1), 'KB:', features.map(f => f.properties.id).join(', '));
