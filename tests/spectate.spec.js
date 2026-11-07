import { test, expect } from '@playwright/test';

test('a late joiner spectates, never sees the answer early, and becomes a player at the rematch', async ({ browser }) => {
  const ctxs = await Promise.all([1, 2, 3].map(() => browser.newContext({ viewport: { width: 1280, height: 800 } })));
  const [a, b, c] = await Promise.all(ctxs.map(x => x.newPage()));
  const errors = [];
  for (const p of [a, b, c]) {
    p.on('pageerror', e => errors.push(e.message));
    await p.route('**/maps?**', r => r.fulfill({ contentType: 'text/html', body: '<p>Panorama stub</p>' }));
  }
  try {
    await a.goto('/');
    const door = a.locator('[data-pick-region="kh"]');
    if (await door.isVisible()) await door.click();
    if (await a.locator('#coach').isVisible()) await a.evaluate(() => closeCoach());
    await a.locator('#start-screen .quick-card.pink').click();
    await a.locator('#party-mode-select').selectOption('sprint');
    await a.locator('#mp-modal button[onclick="createMultiplayerLobby()"]').click();
    await expect.poll(() => a.evaluate(() => roomReady)).toBe(true);
    const code = await a.locator('#room-code-text').innerText();
    await b.goto('/?room=' + code);
    await expect(a.locator('#player-count')).toHaveText('2');
    await a.locator('#start-party-btn').click();
    await expect.poll(() => b.evaluate(() => gameState.roundIndex)).toBe(1);

    // The third browser opens the link mid-match: no error, a banner, no Guess button.
    await c.goto('/?room=' + code);
    await expect(c.locator('#game-screen')).toHaveClass(/active/);
    await expect(c.locator('#spectator-banner')).toBeVisible();
    await expect(c.locator('#spect-title')).toContainText(/Spectating|កំពុងមើល/);
    await expect(c.locator('#guess-action-bar')).toBeHidden();
    await expect(a.locator('#hud-watching')).toBeVisible();
    // Pinning on the spectator's map does nothing, and the redacted view carries no answer yet.
    await c.evaluate(() => gameState.guessMap.fire('click', { latlng: L.latLng(11.55, 104.92) }));
    expect(await c.evaluate(() => gameState.guessLatLng)).toBeNull();
    expect(await c.evaluate(() => gameState.spectMatch.answer)).toBeUndefined();
    // Follow cam: the arrow key moves to the next player.
    const first = await c.evaluate(() => [...document.querySelectorAll('.spect-chip:not(.arrow)')].findIndex(x => x.classList.contains('on')));
    await c.keyboard.press('ArrowRight');
    await expect.poll(() => c.evaluate(() => [...document.querySelectorAll('.spect-chip:not(.arrow)')].findIndex(x => x.classList.contains('on')))).not.toBe(first);

    // Players finish the match; the spectator sees the answer only after the reveal.
    for (let round = 1; round <= 5; round++) {
      for (const p of [a, b]) {
        await p.waitForFunction(() => Date.now() + serverClockOffset >= serverMatch.startedAt);
        await p.evaluate(() => setSheet('full'));
        await p.evaluate(() => { const l = gameState.currentLocation; gameState.guessMap.fire('click', { latlng: L.latLng(l.lat, l.lng) }); });
        await p.locator('#guess-btn').click();
        await expect(p.locator('#result-screen')).toHaveClass(/active/);
      }
      if (round === 1) {
        await expect(c.locator('#spect-results')).toBeVisible();
        expect(await c.evaluate(() => !!gameState.spectMatch.answer)).toBe(true);
      }
      for (const p of [a, b]) await p.locator('#res-next-btn').click();
      if (round < 5) await Promise.all([a.waitForFunction(n => gameState.roundIndex === n, round + 1), b.waitForFunction(n => gameState.roundIndex === n, round + 1)]);
    }
    await expect(a.locator('#final-screen')).toHaveClass(/active/);
    await expect(c.locator('#final-screen')).toHaveClass(/active/);

    // Rematch lobby: the spectator is now a player.
    await a.evaluate(() => resetToHome());
    await expect(c.locator('#lobby-screen')).toHaveClass(/active/);
    await expect(a.locator('#player-count')).toHaveText('3');
    expect(await c.evaluate(() => document.body.dataset.spectator)).toBe('');
    expect(errors).toEqual([]);
  } finally { for (const x of ctxs) await x.close(); }
});
