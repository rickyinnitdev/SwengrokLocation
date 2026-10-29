import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync('index.html', 'utf8');
// The browser's mode and coordinate definitions are the single source of truth.
function definition(name) {
  const match = html.match(new RegExp(`const ${name} = ([\\s\\S]*?);`));
  if (!match) throw new Error(`Missing ${name}`);
  return vm.runInNewContext(`(${match[1]})`);
}
const locations = definition('LOCATIONS_DB');
const modes = definition('MODE_CONFIG');
const extra = JSON.parse(fs.readFileSync('data/extra-locations.json', 'utf8'));
locations.classic.push(...extra.locations);
const all = Object.values(locations).flat();
if (new Set(all.map(l => l.id)).size !== all.length) throw new Error('Duplicate location IDs');
for (const l of all) {
  if (!Number.isFinite(l.lat) || !Number.isFinite(l.lng) || l.lat < 11.4 || l.lat > 11.8 || l.lng < 104.7 || l.lng > 105.1) throw new Error(`Bad coordinate: ${l.id}`);
}
fs.mkdirSync('.generated', { recursive: true });
fs.writeFileSync('.generated/game-data.js', `export const locations = ${JSON.stringify(locations)};\nexport const modes = ${JSON.stringify(modes)};\n`);
fs.mkdirSync('dist', { recursive: true });
const rotationSource = fs.readFileSync('src/location-rotation.js', 'utf8').replace(/^export /gm, '');
fs.writeFileSync('dist/location-rotation.js', `(function(){${rotationSource}\nglobalThis.WanderRotation = {drawLocations, rotationRandom, protocol: GAME_PROTOCOL};})();`);
fs.copyFileSync('data/extra-locations.json', 'dist/extra-locations.json');
const extraScript = `LOCATIONS_DB.classic.push(...${JSON.stringify(extra.locations)});\n`;
fs.writeFileSync('dist/index.html', html.replace('    const ALL_LOCATIONS =', '    ' + extraScript + '    const ALL_LOCATIONS ='));
for (const name of ['avatar_generator.js', 'avatar_default.png']) fs.copyFileSync(name, `dist/${name}`);
fs.mkdirSync('dist/vendor/leaflet', { recursive: true });
for (const name of ['leaflet.js', 'leaflet.css', 'images']) fs.cpSync(`node_modules/leaflet/dist/${name}`, `dist/vendor/leaflet/${name}`, { recursive: true });
fs.writeFileSync('dist/_headers', '/\n  Cache-Control: no-cache\n/index.html\n  Cache-Control: no-cache\n');
console.log(`Built ${all.length} locations (${locations.landmarks.length} landmarks) and ${Object.keys(modes).length} modes.`);
