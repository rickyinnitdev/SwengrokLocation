import { test } from 'node:test';
import assert from 'node:assert/strict';
import { modes, locations } from '../.generated/game-data.js';
import { wikiSections, renderWiki, coverage } from '../client/wiki.js';
import { TRANSLATIONS } from '../client/i18n.js';
import { AVATAR_LOCKS, UNLOCK_LABELS } from '../client/data/avatar-unlocks.js';
import * as rating from '../src/rating.js';
import * as scoring from '../src/scoring.js';

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const ctx = lang => ({
  t: (k, v = {}) => { const s = TRANSLATIONS[lang][k]; assert.ok(s, `missing ${lang} string ${k}`); return s.replace(/\{(\w+)\}/g, (_, n) => v[n] ?? `{${n}}`); },
  lang, modes, tiers: rating.TIERS, locations, unlocks: UNLOCK_LABELS, locks: AVATAR_LOCKS, scoring, rating
});

for (const lang of ['en', 'km']) {
  test(`wiki (${lang}) lists every mode, tier and unlock, with every string translated`, () => {
    const html = renderWiki(ctx(lang));
    for (const cfg of Object.values(modes)) assert.ok(html.includes(esc(lang === 'km' && cfg.nameKm ? cfg.nameKm : cfg.name)), cfg.name);
    for (const tier of rating.TIERS) assert.ok(html.includes(lang === 'km' ? tier.km : tier.en), tier.id);
    for (const l of Object.values(UNLOCK_LABELS)) assert.ok(html.includes(lang === 'km' ? l.km : l.en));
    assert.ok(!/\{\w+\}/.test(html.replace(/<style[\s\S]*?<\/style>/g, '')), 'unfilled placeholder');
  });
}
test('wiki numbers come from the game code, and the coverage map never reveals an answer', () => {
  const html = renderWiki(ctx('en'));
  assert.ok(html.includes(`Everyone starts at ${rating.START_RATING}`));
  for (const tier of rating.TIERS.filter(x => Number.isFinite(x.min))) assert.ok(html.includes(`${tier.min} rating`));
  for (const c of coverage(locations).cells) { assert.equal(Math.abs(c.lat % 10), 0); assert.equal(Math.abs(c.lng % 10), 0); }
  for (const l of locations.countries) assert.ok(!html.includes(l.name), `${l.name} must not be listed`);
  assert.equal(wikiSections(ctx('en')).length, 7);
});
