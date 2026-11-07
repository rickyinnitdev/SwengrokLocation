import { test, expect } from '@playwright/test';

test('Battle Royale: four players play until one is crowned; the eliminated become ghosts', async ({ browser }) => {
  test.setTimeout(180000);
  const ctxs = await Promise.all([0, 1, 2, 3].map(() => browser.newContext({ viewport: { width: 1280, height: 800 } })));
  const pages = await Promise.all(ctxs.map(c => c.newPage()));
  const [a] = pages;
  const errors = [];
  for (const p of pages) {
    p.on('pageerror', e => errors.push(e.message));
    await p.route('**/maps?**', r => r.fulfill({ contentType: 'text/html', body: '<p>Panorama stub</p>' }));
  }
  try {
    await a.goto('/');
    const door = a.locator('[data-pick-region="kh"]');
    if (await door.isVisible()) await door.click();
    if (await a.locator('#coach').isVisible()) await a.evaluate(() => closeCoach());
    await a.locator('#start-screen .quick-card.pink').click();
    await a.locator('#party-mode-select').selectOption('royale');
    await a.locator('#mp-modal button[onclick="createMultiplayerLobby()"]').click();
    await expect.poll(() => a.evaluate(() => roomReady)).toBe(true);
    const code = await a.locator('#room-code-text').innerText();
    await expect(a.locator('#royale-settings')).toBeVisible();
    await a.locator('#royale-lives').selectOption('1');   // one life: every round eliminates someone
    for (const p of pages.slice(1)) await p.goto('/?room=' + code);
    await expect(a.locator('#player-count')).toHaveText('4');
    await expect.poll(() => pages[1].evaluate(() => royaleSettingsLives())).toBe(1);
    await a.locator('#start-party-btn').click();
    for (const p of pages) await expect(p.locator('#game-screen')).toHaveClass(/active/);

    // Degrees of latitude: player 0 is always closest (and earns a bullseye shield), player 3 is farthest.
    // Everyone else stays beyond the 100 m bullseye so no shield saves a loser.
    const offsets = [0, 0.002, 0.004, 0.01];
    let sawGhost = false, sawDuel = false;
    for (let round = 1; round <= 3; round++) {
      const living = [];
      for (const [i, p] of pages.entries()) if (await p.evaluate(() => serverMatch.royale.players[myPlayerId].alive)) living.push([i, p]);
      if (living.length === 2) {
        sawDuel = await living[0][1].evaluate(() => serverMatch.royale.duel);
        await expect(living[0][1].locator('#duel-splash')).toBeVisible(); // FINAL DUEL splash
      }
      for (const [i, p] of living) {
        await p.waitForFunction(() => Date.now() + serverClockOffset >= serverMatch.startedAt);
        await p.evaluate(() => setSheet('full'));
        await p.evaluate(off => { const l = gameState.currentLocation; gameState.guessMap.fire('click', { latlng: L.latLng(l.lat + off, l.lng) }); }, offsets[i]);
        await p.locator('#guess-btn').click();
      }
      for (const [, p] of living) await p.waitForFunction(r => serverMatch.royale.results[r], round);
      // The farthest living player is out and sees the ghost UI; the rest see hearts.
      const out = living[living.length - 1];
      await expect.poll(() => out[1].evaluate(() => document.body.dataset.ghost)).toBe('1');
      await expect(out[1].locator('#spectator-banner')).toBeVisible();
      sawGhost = true;
      if (round === 3) break;
      for (const [i, p] of living) {
        if (i === out[0]) continue;
        await expect(p.locator('#result-screen')).toHaveClass(/active/);
        await p.locator('#res-next-btn').click();
      }
      for (const [i, p] of living) if (i !== out[0]) await p.waitForFunction(n => gameState.roundIndex === n, round + 1);
    }
    expect(sawGhost && sawDuel).toBe(true);
    // The winner (player 0) is crowned after the third round once the survivor presses next.
    await expect(pages[0].locator('#result-screen')).toHaveClass(/active/);
    await pages[0].locator('#res-next-btn').click();
    for (const p of pages) await expect(p.locator('#final-screen')).toHaveClass(/active/);
    await expect(pages[0].locator('#fin-rating')).toContainText(/wins|ឈ្នះ/);
    await expect(pages[0].locator('#fin-rounds-table .st-row').first()).toContainText('+100');
    expect(errors).toEqual([]);
  } finally { for (const c of ctxs) await c.close(); }
});
