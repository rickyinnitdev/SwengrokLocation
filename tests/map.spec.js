import { test, expect } from '@playwright/test';

async function startMode(page, mode, viewport) {
  if (viewport) await page.setViewportSize(viewport);
  await page.route('**/maps?**', r => r.fulfill({ contentType: 'text/html', body: '<p>Panorama stub</p>' }));
  await page.route('**/tile.openstreetmap.org/**', r => r.abort());
  await page.goto('/');
  const door = page.locator('[data-pick-region="kh"]');
  if (await door.isVisible()) await door.click();
  if (await page.locator('#coach').isVisible()) await page.evaluate(() => closeCoach());
  await page.evaluate(() => setLanguage('en'));
  await page.evaluate(m => startQuickPlay(m), mode);
  await expect(page.locator('#game-screen')).toHaveClass(/active/);
  await page.evaluate(() => setSheet('full'));
  await expect(page.locator('.map-chips')).toBeVisible();
}

test('classic: a khan chip frames that khan, then a pin is accepted', async ({ page }) => {
  await startMode(page, 'classic');
  await page.waitForFunction(() => document.querySelector('.map-chip[data-area="Toul Kork"]'));
  const before = await page.evaluate(() => gameState.guessMap.getZoom());
  await page.locator('.map-chip[data-area="Toul Kork"]').click();
  await expect.poll(() => page.evaluate(() => {
    const b = gameState.guessMap.getBounds();
    return b.contains([11.583, 104.898]) && gameState.guessMap.getZoom() > 12;
  })).toBe(true);
  expect(before).toBeLessThanOrEqual(13);
  // The visible map is now (roughly) the khan, not the whole city.
  const span = await page.evaluate(() => { const b = gameState.guessMap.getBounds(); return b.getNorth() - b.getSouth(); });
  expect(span).toBeLessThan(0.2);

  await page.evaluate(() => gameState.guessMap.fire('click', { latlng: L.latLng(11.583, 104.898) }));
  await expect(page.locator('#map-pin-where')).toContainText('Toul Kork');
  await expect(page.locator('#guess-btn')).toBeEnabled();
  await page.locator('#guess-btn').click();
  await expect(page.locator('#result-screen')).toHaveClass(/active/);
});

test('the guess map never offers a search box', async ({ page }) => {
  await startMode(page, 'classic');
  expect(await page.locator('#map-wrapper input[type="search"], #map-wrapper input[type="text"], #map-wrapper [role="search"]').count()).toBe(0);
});

test('landmark icons are locked off wherever they could mark an answer; Cambodia shows city labels', async ({ page }) => {
  for (const mode of ['landmarks', 'classic']) {
    await page.goto('/');
    await startMode(page, mode);
    await page.waitForFunction(() => document.querySelector('.map-chip.layers'));
    await page.locator('.map-chip.layers').click();
    await expect(page.locator('.map-layer-panel')).toContainText(/Khan borders/);
    const row = page.locator('.map-layer-panel label', { hasText: 'Landmarks' }).locator('input');
    await expect(row).toBeDisabled();
    await expect(row).not.toBeChecked();
    expect(await page.evaluate(() => document.querySelectorAll('.lm-label').length)).toBe(0);
  }
  await page.goto('/');
  await startMode(page, 'cambodia');
  await page.waitForFunction(() => document.querySelectorAll('.lm-label').length >= 10);
  expect(await page.evaluate(() => [...document.querySelectorAll('.lm-label')].some(el => el.textContent.includes('Siem Reap')))).toBe(true);
});

test('phones start in crosshair mode and panning moves the pin', async ({ page }) => {
  await startMode(page, 'classic', { width: 390, height: 844 });
  await expect(page.locator('.map-crosshair')).toBeVisible();
  const center = await page.evaluate(() => {
    gameState.guessMap.fire('dragend');
    return gameState.guessLatLng && [gameState.guessLatLng.lat, gameState.guessLatLng.lng];
  });
  expect(center).not.toBeNull();
});
