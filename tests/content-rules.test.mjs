import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { locations, modes } from '../.generated/game-data.js';
import { ASIA_COUNTRIES } from '../client/map/areas.js';
import { drawLocations } from '../src/location-rotation.js';
import { poolFor } from '../src/pools.js';

// Owner rule (see CLAUDE.md): the game contains no content about one excluded country.
const BANNED = /thai|bangkok|chiang\s*mai|phuket|ayutthaya|pattaya|baht|ថៃ|បាងកក/i;
const hits = text => BANNED.test(text);

test('no location mentions the excluded country or its places', () => {
  for (const l of Object.values(locations).flat()) assert.ok(!hits(JSON.stringify(l)), `location ${l.id}`);
});
test('no mode, area or Asia country entry mentions it', () => {
  assert.ok(!hits(JSON.stringify(modes)));
  assert.ok(!hits(JSON.stringify(ASIA_COUNTRIES)));
});
test('i18n, markup, data files and README are clean', () => {
  const files = ['client/i18n.js', 'index.html', 'README.md', 'client/app.js', 'client/map/areas.js', 'client/data/modes.js', 'client/data/locations.js',
    ...fs.readdirSync('data').map(f => 'data/' + f).filter(f => /\.(json|geojson|js)$/.test(f))];
  for (const f of files) assert.ok(!hits(fs.readFileSync(f, 'utf8')), f);
});
test('removed location ids are never reused', () => {
  const ids = new Set(Object.values(locations).flat().map(l => l.id));
  for (const id of ['w_48', 'w_49', 'w_64', 'asia_01', 'asia_02', 'asia_03', 'asia_04', 'asia_05']) {
    assert.ok(!ids.has(id), `${id} was removed and must not return`);
  }
});
test('saved decks and history holding removed ids are filtered out when drawing', () => {
  const pool = poolFor(modes.asia);
  const state = { history: ['asia_01', 'w_48'], decks: { asia: ['asia_01', 'asia_02', pool[0].id, pool[1].id] }, catalogs: {} };
  const picks = drawLocations(pool, 2, state, 'asia');
  assert.equal(picks.length, 2);
  assert.ok(picks.every(l => l && !/^asia_0[1-5]$/.test(l.id)));
});
