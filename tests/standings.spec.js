import { test, expect } from '@playwright/test';

test('party results rank by points: a slightly farther but faster player is listed first', async ({ browser }) => {
  const ca = await browser.newContext({ viewport: { width: 1280, height: 800 } }), cb = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const a = await ca.newPage(), b = await cb.newPage();
  for (const p of [a, b]) await p.route('**/maps?**', r => r.fulfill({ contentType: 'text/html', body: '<p>Panorama stub</p>' }));
  try {
    await a.goto('/');
    const door = a.locator('[data-pick-region="kh"]');
    if (await door.isVisible()) await door.click();
    if (await a.locator('#coach').isVisible()) await a.evaluate(() => closeCoach());
    await a.locator('#start-screen .quick-card.pink').click();
    await a.locator('#party-mode-select').selectOption('classic');
    await a.locator('#mp-modal button[onclick="createMultiplayerLobby()"]').click();
    await expect.poll(() => a.evaluate(() => roomReady)).toBe(true);
    const code = await a.locator('#room-code-text').innerText();
    await b.goto('/?room=' + code);
    await expect(a.locator('#player-count')).toHaveText('2');
    await a.locator('#start-party-btn').click();
    await expect.poll(() => b.evaluate(() => gameState.roundIndex)).toBe(1);
    const idA = await a.evaluate(() => myPlayerId);
    await a.waitForFunction(() => Date.now() + serverClockOffset >= serverMatch.startedAt);
    // A: 60 m off, immediately (about 4,800 + 990). B: exactly right, 20 s later (5,000 + about 660).
    await a.evaluate(() => { const l = gameState.currentLocation; gameState.guessMap.fire('click', { latlng: L.latLng(l.lat + 0.00054, l.lng) }); });
    await a.locator('#guess-btn').click();
    await b.waitForTimeout(20000);
    await b.evaluate(() => { const l = gameState.currentLocation; gameState.guessMap.fire('click', { latlng: L.latLng(l.lat, l.lng) }); });
    await b.locator('#guess-btn').click();
    await expect(a.locator('#result-screen')).toHaveClass(/active/);
    // A's result screen is already up while B waits; open "This round" once B's guess is in.
    await expect(a.locator('#mp-round-players-list')).toContainText(/\d/);
    await a.locator('#standings-tabs [data-tab="round"]').click();
    await expect(a.locator('#mp-round-players-list .st-row')).toHaveCount(2);
    await expect(a.locator('#mp-round-players-list .st-sub').nth(1)).toContainText('0 m');   // B's exact pin is the one listed second
    await expect(a.locator('#mp-round-players-list .st-row').first()).toHaveAttribute('data-player', idA);
    // The tabs work by hand, and "Overall" shows a position marker.
    await a.locator('#standings-tabs [data-tab="overall"]').click();
    await expect(a.locator('#standings-tabs [data-tab="overall"]')).toHaveClass(/active/);
    await expect(a.locator('#mp-round-players-list .st-move').first()).toBeVisible();
  } finally { await ca.close(); await cb.close(); }
});
