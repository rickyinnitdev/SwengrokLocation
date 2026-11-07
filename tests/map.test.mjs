import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { khanAt, pointInRing, featureBounds } from '../client/map/geo.js';
import { MODE_CONFIG } from '../client/data/modes.js';
import { CHIP_SETS } from '../client/map/areas.js';

const khans = JSON.parse(fs.readFileSync('data/pp-khans.geojson', 'utf8'));

test('pointInRing handles inside, outside and concave shapes', () => {
  const square = [[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]];
  assert.ok(pointInRing(2, 2, square));
  assert.ok(!pointInRing(5, 2, square));
  const u = [[0, 0], [6, 0], [6, 6], [4, 6], [4, 2], [2, 2], [2, 6], [0, 6], [0, 0]];
  assert.ok(!pointInRing(4, 3, u), 'inside the notch of the U');
  assert.ok(pointInRing(1, 4, u));
});
test('khan lookup finds the right khan for well-known places', () => {
  assert.equal(khans.features.length, 14);
  const at = (lat, lng) => khanAt(lat, lng, khans)?.id;
  assert.equal(at(11.5564, 104.9282), 'Boeng Keng Kang'); // Independence Monument (BKK1)
  assert.equal(at(11.5636, 104.9314), 'Daun Penh');   // Royal Palace
  assert.equal(at(11.5764, 104.9232), 'Daun Penh');   // Wat Phnom
  assert.equal(at(11.5855, 104.8995), 'Toul Kork');   // TK Avenue
  assert.equal(at(11.546, 104.844), 'Pou Senchey');   // airport
  assert.equal(at(0, 0), undefined);                  // nowhere near Phnom Penh
});
test('feature bounds enclose the feature centre', () => {
  for (const f of khans.features) {
    const [[s, w], [n, e]] = featureBounds(f);
    const [lng, lat] = f.properties.center;
    assert.ok(lat > s && lat < n && lng > w && lng < e, f.properties.id);
  }
});
test('every mode has a map profile and the data stays small', () => {
  for (const [key, cfg] of Object.entries(MODE_CONFIG)) {
    assert.ok(cfg.map?.bounds, key);
    assert.ok(CHIP_SETS[cfg.map.quickJumps] || cfg.map.quickJumps === 'pp-khans', key);
  }
  assert.deepEqual(MODE_CONFIG.landmarks.map.lockedOverlays, { landmarks: false });
  assert.ok(!MODE_CONFIG.landmarks.map.overlays.includes('landmarks'));
  assert.equal(MODE_CONFIG.world.map.maxBounds, null);
  assert.equal(MODE_CONFIG.cambodia.map.quickJumps, 'kh-provinces');
  assert.equal(MODE_CONFIG.asia.map.quickJumps, 'asia-countries');
  assert.ok(zlib.gzipSync(fs.readFileSync('data/pp-khans.geojson')).length < 150 * 1024);
  const extras = ['geo', 'areas', 'profile', 'tools'].map(n => fs.readFileSync(`client/map/${n}.js`));
  const total = extras.reduce((a, b) => a + zlib.gzipSync(b).length, 0) + zlib.gzipSync(fs.readFileSync('data/pp-khans.geojson')).length;
  assert.ok(total < 400 * 1024, `guess-map extras gzip to ${total} bytes`);
});
test('the guess map has no place search or geocoding', () => {
  for (const n of ['geo', 'areas', 'profile', 'tools']) {
    const src = fs.readFileSync(`client/map/${n}.js`, 'utf8');
    assert.ok(!/nominatim|geocod|type="search"|placeholder/i.test(src.replace(/no place search or geocoding/gi, '')), n);
  }
  assert.ok(!/id="map-search|geocode|nominatim/i.test(fs.readFileSync('index.html', 'utf8')));
});
test('landmark icons are locked off wherever landmarks can be the answer', () => {
  for (const [key, cfg] of Object.entries(MODE_CONFIG)) {
    if (cfg.pool !== 'all' && cfg.pool !== 'landmarks') continue;
    assert.equal(cfg.map.lockedOverlays?.landmarks, false, key);
    assert.ok(!cfg.map.overlays.includes('landmarks'), key);
  }
  assert.ok(MODE_CONFIG.cambodia.map.overlays.includes('landmarks'), 'Cambodia keeps its city labels');
});
