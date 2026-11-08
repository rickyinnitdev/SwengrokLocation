import fs from 'node:fs';
import path from 'node:path';
import { MODE_CONFIG } from '../client/data/modes.js';
import { LOCATIONS_DB } from '../client/data/locations.js';

// The browser's mode and coordinate definitions are the single source of truth.
const locations = structuredClone(LOCATIONS_DB);
const modes = structuredClone(MODE_CONFIG);
const extra = JSON.parse(fs.readFileSync('data/extra-locations.json', 'utf8'));
locations.classic.push(...extra.locations);

const all = Object.values(locations).flat();
if (new Set(all.map(l => l.id)).size !== all.length) throw new Error('Duplicate location IDs');
for (const l of all) {
  if (l.country || l.isCambodiaWide) {
    if (!Number.isFinite(l.lat) || !Number.isFinite(l.lng) || l.lat < -90 || l.lat > 90 || l.lng < -180 || l.lng > 180) throw new Error(`Bad coordinate: ${l.id}`);
  } else {
    if (!Number.isFinite(l.lat) || !Number.isFinite(l.lng) || l.lat < 11.4 || l.lat > 11.8 || l.lng < 104.7 || l.lng > 105.1) throw new Error(`Bad coordinate: ${l.id}`);
  }
}
for (const [key, cfg] of Object.entries(modes)) {
  if (cfg.region !== 'kh' && cfg.region !== 'world') throw new Error(`Mode ${key} has no region`);
  if (!Number.isInteger(cfg.rounds) || !Number.isInteger(cfg.time)) throw new Error(`Mode ${key} has bad timing`);
}

fs.mkdirSync('.generated', { recursive: true });
fs.writeFileSync('.generated/game-data.js', `export const locations = ${JSON.stringify(locations)};\nexport const modes = ${JSON.stringify(modes)};\n`);

fs.rmSync('dist', { recursive: true, force: true });
fs.mkdirSync('dist', { recursive: true });

// Plain static client. No bundler: ES modules are served as written.
fs.cpSync('client', 'dist/client', { recursive: true });
fs.rmSync('dist/client/_markup_extract.html', { force: true });
// Server-side door-agnostic extras are appended to the client module too.
fs.appendFileSync('dist/client/data/locations.js', `\nLOCATIONS_DB.classic.push(...${JSON.stringify(extra.locations)});\n`);
// The Wiki reads the same rating and scoring code as the server, copied next to the client.
fs.mkdirSync('dist/client/shared', { recursive: true });
for (const f of ['rating.js', 'scoring.js']) fs.copyFileSync(`src/${f}`, `dist/client/shared/${f}`);
fs.copyFileSync('index.html', 'dist/index.html');
fs.mkdirSync('dist/data', { recursive: true });
fs.copyFileSync('data/pp-khans.geojson', 'dist/data/pp-khans.geojson');

const rotationSource = fs.readFileSync('src/location-rotation.js', 'utf8').replace(/^export /gm, '');
fs.writeFileSync('dist/location-rotation.js', `(function(){${rotationSource}\nglobalThis.WanderRotation = {drawLocations, rotationRandom, protocol: GAME_PROTOCOL};})();`);
for (const name of ['avatar_generator.js', 'avatar_default.png']) fs.copyFileSync(name, `dist/${name}`);
fs.mkdirSync('dist/vendor/leaflet', { recursive: true });
for (const name of ['leaflet.js', 'leaflet.css', 'images']) {
  fs.cpSync(path.join('node_modules/leaflet/dist', name), path.join('dist/vendor/leaflet', name), { recursive: true });
}
fs.writeFileSync('dist/_headers', '/\n  Cache-Control: no-cache\n/index.html\n  Cache-Control: no-cache\n');
console.log(`Built ${all.length} locations (${locations.landmarks.length} landmarks) and ${Object.keys(modes).length} modes.`);
