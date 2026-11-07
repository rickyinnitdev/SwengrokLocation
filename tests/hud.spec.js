import { test, expect } from '@playwright/test';

async function soloGame(page, viewport) {
  await page.setViewportSize(viewport);
  await page.route('**/maps?**', r => r.fulfill({ contentType: 'text/html', body: '<p>Panorama stub</p>' }));
  await page.route('**/tile.openstreetmap.org/**', r => r.abort());
  await page.goto('/');
  const door = page.locator('[data-pick-region="kh"]');
  if (await door.isVisible()) await door.click();
  if (await page.locator('#coach').isVisible()) await page.evaluate(() => closeCoach());
  await page.evaluate(() => startQuickPlay('classic'));
  await expect(page.locator('#game-screen')).toHaveClass(/active/);
}
const box = async loc => (await loc.boundingBox());

test('desktop 1440x900: panorama fills the screen, map grows on hover, Guess needs a pin', async ({ page }) => {
  await soloGame(page, { width: 1440, height: 900 });
  const pano = await box(page.locator('#streetview-container'));
  expect(pano.width).toBe(1440);
  expect(pano.height).toBe(900);
  // The old split layout and its divider are gone.
  await expect(page.locator('#map-resizer')).toHaveCount(0);

  const panel = page.locator('#map-panel');
  await page.mouse.move(700, 300);
  const small = await box(panel);
  expect(small.width).toBeLessThan(330);
  await page.mouse.move(small.x + 40, small.y + 40);
  await expect.poll(async () => (await box(panel)).width).toBeGreaterThan(540);

  await expect(page.locator('#guess-btn')).toBeDisabled();
  await page.evaluate(() => gameState.guessMap.fire('click', { latlng: L.latLng(11.55, 104.92) }));
  await expect(page.locator('#guess-btn')).toBeEnabled();

  // Pinned map stays big when the mouse leaves; the choice is remembered.
  await page.locator('#map-pin-toggle').click();
  await page.mouse.move(600, 200);
  await page.waitForTimeout(400);
  expect((await box(panel)).width).toBeGreaterThan(540);
  expect(await page.evaluate(() => localStorage.getItem('wanderpenh_map_pinned'))).toBe('1');
});

test('desktop: return-to-start reloads the panorama at the round start', async ({ page }) => {
  await soloGame(page, { width: 1440, height: 900 });
  await page.waitForFunction(() => document.getElementById('streetview-iframe').src.includes('cbll='));
  const start = await page.evaluate(() => document.getElementById('streetview-iframe').src);
  await page.evaluate(() => { document.getElementById('streetview-iframe').src = 'about:blank'; });
  await page.locator('#control-dock [onclick="returnToStartPano()"]').click();
  await expect.poll(() => page.evaluate(() => document.getElementById('streetview-iframe').src)).toBe(start);
  // Honest compass: it names the start heading and does not claim a live one.
  await expect(page.locator('#compass-label')).toContainText(/Start heading|ទិសចាប់ផ្តើម/);
});

test('phone 390x844: bottom sheet is still used and the dock collapses to one button', async ({ page }) => {
  await soloGame(page, { width: 390, height: 844 });
  await expect(page.locator('#map-panel')).toHaveAttribute('data-state', 'peek');
  await expect(page.locator('#sheet-handle')).toBeVisible();
  await expect(page.locator('#dock-more')).toBeVisible();
  await expect(page.locator('.dock-items')).toBeHidden();
  await page.locator('#dock-more').click();
  await expect(page.locator('.dock-items')).toBeVisible();
});

test('party: the who-guessed strip ticks when another player locks in', async ({ browser }) => {
  const ca = await browser.newContext({ viewport: { width: 1440, height: 900 } }), cb = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const a = await ca.newPage(), b = await cb.newPage();
  for (const p of [a, b]) await p.route('**/maps?**', r => r.fulfill({ contentType: 'text/html', body: '<p>Panorama stub</p>' }));
  try {
    await a.goto('/');
    const door = a.locator('[data-pick-region="kh"]');
    if (await door.isVisible()) await door.click();
    if (await a.locator('#coach').isVisible()) await a.evaluate(() => closeCoach());
    await a.locator('#start-screen .quick-card.pink').click();
    await a.locator('#mp-modal button[onclick="createMultiplayerLobby()"]').click();
    await expect.poll(() => a.evaluate(() => roomReady)).toBe(true);
    const code = await a.locator('#room-code-text').innerText();
    await b.goto('/?room=' + code);
    await expect(a.locator('#player-count')).toHaveText('2');
    await a.locator('#start-party-btn').click();
    await expect.poll(() => b.evaluate(() => gameState.roundIndex)).toBe(1);
    await b.waitForFunction(() => Date.now() + serverClockOffset >= serverMatch.startedAt);
    await expect(a.locator('.who-chip')).toHaveCount(2);
    await expect(a.locator('.who-chip.guessed')).toHaveCount(0);
    await b.evaluate(() => gameState.guessMap.fire('click', { latlng: L.latLng(gameState.currentLocation.lat, gameState.currentLocation.lng) }));
    await b.locator('#guess-btn').click();
    await expect(a.locator('.who-chip.guessed .who-chip-tick')).toHaveText('✓');
  } finally { await ca.close(); await cb.close(); }
});
