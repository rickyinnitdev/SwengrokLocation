import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { RoomEngine, profile } from '../src/room-engine.js';
import { AVATAR_LOCKS, isLocked, stripLocked, unlocksFrom } from '../client/data/avatar-unlocks.js';

// avatar_generator.js is a classic browser script, so load it the way the browser does.
const src = fs.readFileSync('avatar_generator.js', 'utf8');
const A = vm.runInNewContext(`${src}\n({ generateAvatarSVG, sanitizeAvatarConfig, AVATAR_DEFAULTS, AVATAR_ALLOWED })`, { console });

const NEW_SLOTS = ['headwear', 'eyebrows', 'facialHair', 'accessory', 'bgStyle', 'frame'];

test('sanitizeAvatarConfig rejects unknown values for every slot, new and old', () => {
  for (const slot of Object.keys(A.AVATAR_ALLOWED)) {
    const out = A.sanitizeAvatarConfig({ [slot]: '"><script>alert(1)</script>' });
    assert.equal(out[slot], A.AVATAR_DEFAULTS[slot], slot);
  }
  const bad = A.sanitizeAvatarConfig({ skinColor: 'red;onload=1', hairColor: '#12345', bg: 5 });
  assert.equal(bad.skinColor, A.AVATAR_DEFAULTS.skinColor);
  assert.equal(bad.hairColor, A.AVATAR_DEFAULTS.hairColor);
  assert.equal(bad.bg, A.AVATAR_DEFAULTS.bg);
  for (const slot of NEW_SLOTS) assert.ok(slot in A.AVATAR_DEFAULTS, slot);
});
test('every option of every slot renders a well-formed SVG without throwing', () => {
  let count = 0;
  for (const [slot, values] of Object.entries(A.AVATAR_ALLOWED)) {
    for (const value of values) {
      const svg = A.generateAvatarSVG({ [slot]: value });
      assert.match(svg, /^\s*<svg[\s\S]*<\/svg>\s*$/, `${slot}=${value}`);
      assert.doesNotMatch(svg, /undefined|NaN|\[object/, `${slot}=${value}`);
      // Balanced tags: every open <g> has a close.
      assert.equal((svg.match(/<g[\s>]/g) || []).length, (svg.match(/<\/g>/g) || []).length, `${slot}=${value}`);
      count++;
    }
  }
  assert.ok(count > 70, `walked ${count} options`);
});
test('the renderer caches per configuration', () => {
  const a = A.generateAvatarSVG({ hairStyle: 'bun', headwear: 'crown' });
  const b = A.generateAvatarSVG({ headwear: 'crown', hairStyle: 'bun' });
  assert.equal(a, b);
  assert.notEqual(a, A.generateAvatarSVG({ hairStyle: 'bun' }));
});
test('the server keeps every avatar field, up to 24', () => {
  const cfg = { ...A.AVATAR_DEFAULTS };
  assert.ok(Object.keys(cfg).length <= 24, 'all options fit the field limit');
  const kept = profile({ name: 'x', avatarConfig: cfg }).avatarConfig;
  assert.equal(Object.keys(kept).length, Object.keys(cfg).length);
  for (const slot of NEW_SLOTS) assert.equal(kept[slot], cfg[slot]);
  const many = Object.fromEntries([...Array(40)].map((_, i) => ['k' + i, 'v']));
  assert.equal(Object.keys(profile({ avatarConfig: many }).avatarConfig).length, 24);
});
test('locked items are stripped unless earned', () => {
  assert.ok(isLocked('frame', 'royale', []));
  assert.ok(!isLocked('frame', 'royale', ['royale']));
  assert.ok(!isLocked('frame', 'goldTicket', []));
  const cfg = { frame: 'rankLegend', headwear: 'helmetTuk', hairStyle: 'bun' };
  assert.deepEqual(stripLocked(cfg, []), { frame: 'plain', headwear: 'none', hairStyle: 'bun' });
  assert.deepEqual(stripLocked(cfg, ['tuktuk']), { frame: 'plain', headwear: 'helmetTuk', hairStyle: 'bun' });
  assert.deepEqual(unlocksFrom({ kh: { tier: 'tuktuk' }, world: { tier: 'tourist' } }, 0), ['tuktuk']);
  assert.deepEqual(unlocksFrom({ kh: { tier: 'legend' } }, 2), ['tuktuk', 'legend', 'royale']);
  for (const [slot, map] of Object.entries(AVATAR_LOCKS)) for (const id of Object.keys(map)) assert.ok(A.AVATAR_ALLOWED[slot].includes(id), `${slot}.${id} is a real option`);
});
test('a locked frame in a player profile is removed server-side', () => {
  const e = new RoomEngine();
  const host = e.join({ create: true, profile: { name: 'H', avatarConfig: { frame: 'royale', headwear: 'crownGold', hairStyle: 'bun' } } }, 1000);
  assert.equal(host.profile.avatarConfig.frame, 'plain');
  assert.equal(host.profile.avatarConfig.headwear, 'none');
  assert.equal(host.profile.avatarConfig.hairStyle, 'bun');
  assert.equal(host.wanted.avatarConfig.frame, 'royale', 'the request is remembered');
  host.unlocks = ['royale', 'legend'];
  e.handle(host.id, { type: 'UPDATE_PROFILE', profile: { name: 'H', avatarConfig: { frame: 'royale', headwear: 'crownGold' } } }, 1100);
  assert.equal(host.profile.avatarConfig.frame, 'royale');
  assert.equal(host.profile.avatarConfig.headwear, 'crownGold');
});
