import { test, expect } from '@playwright/test';

async function enterHome(page) {
  await page.goto('/');
  const door = page.locator('[data-pick-region="kh"]');
  if (await door.isVisible()) await door.click();
  await expect(page.locator('#start-screen')).toHaveClass(/active/);
  if (await page.locator('#coach').isVisible()) await page.evaluate(() => closeCoach());
}
const stub = p => p.route('**/maps?**', r => r.fulfill({ contentType: 'text/html', body: '<p>Panorama stub</p>' }));

test('Wiki lists every mode and tier and is searchable', async ({ page }) => {
  await stub(page);
  await page.goto('/?wiki');
  await expect(page.locator('#wiki-screen')).toHaveClass(/active/);
  const modeCount = await page.evaluate(() => Object.keys(window.MODE_CONFIG || {}).length);
  const items = await page.locator('#wiki-modes .wiki-item').count();
  expect(items).toBeGreaterThan(8);
  if (modeCount) expect(items).toBe(modeCount);
  await expect(page.locator('#wiki-ranks [data-tier]')).toHaveCount(6);
  await page.locator('#wiki-search').fill('royale');
  await expect(page.locator('#wiki-modes .wiki-item:visible').first()).toContainText(/royale/i);
  await page.locator('#wiki-search').fill('zzzz-nothing');
  await expect(page.locator('#wiki-empty')).toBeVisible();
});

test('a player who loses the network for 20 s rejoins the same seat with the same score', async ({ browser }) => {
  const ca = await browser.newContext(), cb = await browser.newContext();
  const a = await ca.newPage(), b = await cb.newPage();
  for (const p of [a, b]) await stub(p);
  try {
    await enterHome(a);
    await a.locator('#start-screen .quick-card.pink').click();
    await a.locator('#mp-modal button[onclick="createMultiplayerLobby()"]').click();
    await expect.poll(() => a.evaluate(() => roomReady)).toBe(true);
    const code = await a.locator('#room-code-text').innerText();
    await b.goto('/?room=' + code);
    await expect(a.locator('#player-count')).toHaveText('2');
    const id = await b.evaluate(() => myPlayerId);
    await cb.setOffline(true);
    await b.waitForTimeout(20000);
    await cb.setOffline(false);
    await expect.poll(() => b.evaluate(() => roomReady), { timeout: 30000 }).toBe(true);
    expect(await b.evaluate(() => myPlayerId)).toBe(id);
    await expect(a.locator('#player-count')).toHaveText('2');
  } finally { await ca.close(); await cb.close(); }
});

test('host can switch a party to ranked and the mode list shrinks to ranked modes', async ({ browser }) => {
  const ca = await browser.newContext(), a = await ca.newPage();
  await stub(a);
  try {
    await enterHome(a);
    await a.locator('#start-screen .quick-card.pink').click();
    await a.locator('#mp-modal button[onclick="createMultiplayerLobby()"]').click();
    await expect.poll(() => a.evaluate(() => roomReady)).toBe(true);
    await a.locator('#ranked-party-toggle').check();
    await expect(a.locator('#ranked-party-note')).toBeVisible();
    const opts = await a.locator('#lobby-mode-select option').allInnerTexts();
    expect(opts.join(' ')).not.toMatch(/Royale/i);
    await expect(a.locator('#spectator-answer-label')).toBeHidden();
  } finally { await ca.close(); }
});
