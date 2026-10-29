import { test, expect } from '@playwright/test';

test('server confirms joins, mode sync, guesses, refresh recovery, complete match and rematch', async ({ browser }) => {
  const ca = await browser.newContext(), cb = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const a = await ca.newPage(), b = await cb.newPage();
  const errors = [];
  for (const p of [a, b]) {
    p.on('pageerror', e => errors.push(e.message));
    await p.route('**/maps/embed**', r => r.fulfill({ contentType: 'text/html', body: '<p>Panorama provider stub</p>' }));
  }
  try {
    await Promise.all([a.goto('/'), b.goto('/')]);
    await a.getByRole('button', { name: /Play with Friends/ }).click();
    await a.locator('#party-mode-select').selectOption('sprint');
    await a.getByRole('button', { name: 'Create New Party Lobby' }).click();
    await expect.poll(() => a.evaluate(() => roomReady)).toBe(true);
    const code = await a.locator('#room-code-text').innerText();
    await expect(a.locator('#start-party-btn')).toBeDisabled();
    await b.goto('/?room=' + code);
    await expect(a.locator('#player-count')).toHaveText('2');
    await expect(b.locator('#player-count')).toHaveText('2');
    await expect(b.locator('#lobby-mode-select')).toHaveValue('sprint');
    await expect(b.locator('#lobby-mode-select')).toBeDisabled();
    await a.locator('#lobby-mode-select').selectOption('classic');
    await expect(b.locator('#lobby-mode-select')).toHaveValue('classic');
    await b.screenshot({ path: 'test-results/party-mobile.png', fullPage: true });
    await a.locator('#start-party-btn').click();
    await expect.poll(() => b.evaluate(() => gameState.roundIndex)).toBe(1);
    expect(await a.evaluate(() => JSON.stringify(gameState.matchPlan))).toBe(await b.evaluate(() => JSON.stringify(gameState.matchPlan)));
    const id = await b.evaluate(() => myPlayerId);
    await b.reload();
    await expect.poll(() => b.evaluate(() => roomReady && myPlayerId)).toBe(id);
    await expect.poll(() => b.evaluate(() => gameState.roundIndex)).toBe(1);
    for (let round = 1; round <= 5; round++) {
      for (const p of [a, b]) {
        await p.waitForFunction(() => Date.now() + serverClockOffset >= serverMatch.startedAt);
        await p.evaluate(() => {
          gameState.guessMap.fire('click', { latlng: L.latLng(gameState.currentLocation.lat, gameState.currentLocation.lng) });
        });
        await p.locator('#guess-btn').click();
        await expect(p.locator('#result-screen')).toHaveClass(/active/);
        await p.locator('#res-next-btn').click();
        if (p === a) expect(await a.evaluate(() => gameState.roundIndex)).toBe(round);
      }
      if (round < 5) await Promise.all([a.waitForFunction(n => gameState.roundIndex === n, round + 1), b.waitForFunction(n => gameState.roundIndex === n, round + 1)]);
    }
    await expect(a.locator('#final-screen')).toHaveClass(/active/);
    await expect(b.locator('#final-screen')).toHaveClass(/active/);
    expect(await a.evaluate(() => gameState.totalScore)).toBeGreaterThan(25000);
    await a.evaluate(() => resetToHome());
    await expect(b.locator('#lobby-screen')).toHaveClass(/active/);
    await a.locator('#start-party-btn').click();
    await expect(b.locator('#game-screen')).toHaveClass(/active/);
    await a.evaluate(() => leaveLobby());
    await expect.poll(() => b.evaluate(() => gameState.isHost)).toBe(true);
    expect(errors).toEqual([]);
  } finally { await ca.close(); await cb.close(); }
});

test('invalid rooms fail visibly; no room is fabricated on join', async ({ page }) => {
  await page.goto('/?room=WP-ZZZZZZ');
  await expect(page.locator('#start-screen')).toHaveClass(/active/);
  await expect.poll(() => page.evaluate(() => gameState.isMultiplayer)).toBe(false);
});

test('rooms stay isolated; shared skip, fixed-view mode and socket reconnect work', async ({ browser }) => {
  const contexts = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()]);
  const pages = await Promise.all(contexts.map(c => c.newPage()));
  const [host, friend, other] = pages;
  try {
    for (const p of pages) {
      await p.route('**/maps?**', r => r.fulfill({ contentType: 'text/html', body: '<p>Panorama stub</p>' }));
      await p.goto('/');
    }
    expect(await host.evaluate(() => ALL_LOCATIONS.length)).toBe(210);
    await host.evaluate(() => { openMultiplayerModal(); document.getElementById('party-mode-select').value = 'nmpz'; createMultiplayerLobby(); });
    await other.evaluate(() => { openMultiplayerModal(); createMultiplayerLobby(); });
    await expect.poll(() => host.evaluate(() => roomReady)).toBe(true);
    await expect.poll(() => other.evaluate(() => roomReady)).toBe(true);
    const code = await host.evaluate(() => gameState.roomCode);
    await friend.goto('/?room=' + code);
    await expect(host.locator('#player-count')).toHaveText('2');
    await expect(other.locator('#player-count')).toHaveText('1');
    const id = await friend.evaluate(() => myPlayerId);
    await friend.evaluate(() => roomSocket.close());
    await expect.poll(() => friend.evaluate(() => roomReady && myPlayerId)).toBe(id);
    await host.locator('#start-party-btn').click();
    await expect.poll(() => friend.evaluate(() => gameState.roundIndex)).toBe(1);
    await expect(friend.locator('#streetview-iframe')).toHaveCSS('pointer-events', 'none');
    const old = await host.evaluate(() => gameState.currentLocation.id);
    await host.evaluate(() => skipBrokenLocation());
    await expect.poll(() => friend.evaluate(() => gameState.currentLocation.id)).not.toBe(old);
    expect(await host.evaluate(() => gameState.currentLocation.id)).toBe(await friend.evaluate(() => gameState.currentLocation.id));
    await expect(other.locator('#lobby-screen')).toHaveClass(/active/);
  } finally { await Promise.all(contexts.map(c => c.close())); }
});
