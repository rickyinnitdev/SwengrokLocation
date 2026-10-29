import fs from 'node:fs';
import vm from 'node:vm';

const attrs = text => Object.fromEntries([...text.matchAll(/([\w:]+)="([^"]*)"/g)].map(m => [m[1], m[2].replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&apos;', "'")]));
const html = fs.readFileSync('index.html', 'utf8');
const original = Object.values(vm.runInNewContext('(' + html.match(/const LOCATIONS_DB = ([\s\S]*?);/)[1] + ')')).flat();
const extra = JSON.parse(fs.readFileSync('data/extra-locations.json', 'utf8'));
const existing = [...original, ...extra.locations];
const existingIds = new Set(existing.map(l => l.id));
const candidates = new Map();
const bounds = [
  { file: 'data/osm-north.raw.xml', minLat: 11.58, maxLat: 11.615, minLng: 104.875, maxLng: 104.925, area: 'Northern Phnom Penh' },
  { file: 'data/osm-south.raw.xml', minLat: 11.515, maxLat: 11.55, minLng: 104.90, maxLng: 104.945, area: 'Southern Phnom Penh' }
];
for (const box of bounds) {
  const xml = fs.readFileSync(box.file, 'utf8');
  const nodes = new Map();
  for (const m of xml.matchAll(/<node\s+([^>]+)>|<node\s+([^>]+)\/>/g)) {
    const a = attrs(m[1] || m[2]);
    nodes.set(a.id, { lat: +a.lat, lng: +a.lon });
  }
  for (const m of xml.matchAll(/<way\s+([^>]+)>([\s\S]*?)<\/way>/g)) {
    const way = attrs(m[1]), tags = {};
    for (const t of m[2].matchAll(/<tag\s+([^>]+)\/>/g)) { const a = attrs(t[1]); tags[a.k] = a.v; }
    if (!/^(primary|secondary|tertiary|residential)$/.test(tags.highway) || !tags.name || tags.access === 'private') continue;
    const id = 'osm_' + way.id;
    if (existingIds.has(id)) continue;
    const refs = [...m[2].matchAll(/<nd ref="(\d+)"\/>/g)].map(r => nodes.get(r[1])).filter(Boolean);
    if (!refs.length) continue;
    const n = refs[Math.floor(refs.length / 2)];
    if (n.lat < box.minLat || n.lat > box.maxLat || n.lng < box.minLng || n.lng > box.maxLng) continue;
    candidates.set(id, { id, name: tags['name:en'] || tags.name, ...n, area: box.area, osmWay: way.id });
  }
}
const d2 = (a, b) => ((a.lat - b.lat) * 111000) ** 2 + ((a.lng - b.lng) * 108800) ** 2;
const pool = [...candidates.values()];
for (const c of pool) c.nearest = Math.min(...existing.map(l => d2(c, l)));
const added = [];
while (added.length < 190 && pool.length) {
  pool.sort((a, b) => b.nearest - a.nearest);
  const pick = pool.shift();
  if (pick.nearest < 220 ** 2) break;
  delete pick.nearest;
  added.push(pick);
  for (const c of pool) c.nearest = Math.min(c.nearest, d2(c, pick));
}
extra.locations.push(...added);
extra.coverage = 'Named road geometry across central, northern and southern Phnom Penh; panorama availability is not guaranteed.';
fs.writeFileSync('data/extra-locations.json', JSON.stringify(extra, null, 2) + '\n');
console.log(`Added ${added.length} spaced road locations; total ${original.length + extra.locations.length}.`);
