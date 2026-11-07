import { test, expect } from '@playwright/test';

// Phase 2: the first visit opens the doors screen. Tests that start from the
// home screen must pick Cambodia first, exactly like a player does.
async function enterHome(page) {
  await page.goto('/');
  const door = page.locator('[data-pick-region="kh"]');
  if (await door.isVisible()) await door.click();
  await expect(page.locator('#start-screen')).toHaveClass(/active/);
  if (await page.locator('#coach').isVisible()) await page.evaluate(() => closeCoach());
}

test('doors take two taps, the language toggle switches copy and the phone map sheet cycles', async ({ page }) => {
  // Part C: the sheet is the phone layout (< 900px). Desktop is covered by hud.spec.js.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/maps?**', r => r.fulfill({ contentType: 'text/html', body: '<p>Panorama stub</p>' }));
  await page.goto('/');
  await expect(page.locator('#doors-screen')).toHaveClass(/active/);

  // Tap 1: the Cambodia door. Tap 2: Play now.
  await page.locator('[data-pick-region="kh"]').click();
  await expect(page.locator('#start-screen')).toHaveClass(/active/);
  await expect(page.locator('#doors-screen')).not.toHaveClass(/active/);
  await expect(page.locator('#lang-toggle')).toHaveText('EN');
  await expect(page.locator('#play-now-btn')).toContainText('លេងឥឡូវ');
  await expect(page.locator('#featured-modes-container')).toContainText('សម្គាល់ដីសំខាន់');
  if (await page.locator('#coach').isVisible()) await page.evaluate(() => closeCoach());

  await page.locator('#lang-toggle').click();
  await expect(page.locator('#lang-toggle')).toHaveText('ខ្មែរ');
  await expect(page.locator('#play-now-btn')).toContainText('Play now');
  await expect(page.locator('#featured-modes-container')).toContainText('Landmark Blitz');

  await page.locator('#lang-toggle').click();
  await expect(page.locator('#play-now-btn')).toContainText('លេងឥឡូវ');

  await page.locator('#play-now-btn').click();
  await expect(page.locator('#game-screen')).toHaveClass(/active/);
  await expect(page.locator('#map-panel')).toHaveAttribute('data-state', 'peek');
  await page.locator('#expand-toggle').click();
  await expect(page.locator('#map-panel')).toHaveAttribute('data-state', 'half');
  await page.locator('#expand-toggle').click();
  await expect(page.locator('#map-panel')).toHaveAttribute('data-state', 'full');
});

test('server confirms joins, mode sync, guesses, refresh recovery, complete match and rematch', async ({ browser }) => {
  const ca = await browser.newContext(), cb = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const a = await ca.newPage(), b = await cb.newPage();
  const errors = [];
  for (const p of [a, b]) {
    p.on('pageerror', e => errors.push(e.message));
    await p.route('**/maps?**', r => r.fulfill({ contentType: 'text/html', body: '<p>Panorama provider stub</p>' }));
  }
  try {
    await Promise.all([enterHome(a), b.goto('/')]);
    await a.locator('#start-screen .quick-card.pink').click();
    await a.locator('#party-mode-select').selectOption('sprint');
    await a.locator('#mp-modal button[onclick="createMultiplayerLobby()"]').click();
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
    await b.getByRole('button', { name: 'Customize your lobby character' }).click();
    await expect(b.locator('#profile-modal')).toHaveClass(/active/);
    await b.locator('#profile-name-input').fill('Lobby explorer');
    await b.evaluate(() => setStudioOption('hair', 'beanie'));
    await b.locator('#profile-modal button[onclick="saveProfile()"]').click();
    await expect(a.locator('#lobby-players-container')).toContainText('Lobby explorer');
    await expect.poll(() => a.evaluate(() => getLobbyPlayers().find(p => p.name === 'Lobby explorer')?.avatarConfig.hairStyle)).toBe('beanie');
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
        await p.evaluate(() => setSheet('full'));
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
      await enterHome(p);
    }
    expect(await host.evaluate(() => ALL_LOCATIONS.length)).toBe(392);
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

test('solo draw deck and history survive refresh without repeating the pool', async ({ page }) => {
  await enterHome(page);
  const first = await page.evaluate(() => {
    currentMode = 'classic';
    const result = [];
    for (let i = 0; i < 150; i++) {
      if (i % 5 === 0) gameState.usedLocIds = [];
      result.push(getNextUniqueLocation().id);
    }
    return result;
  });
  const partySpots = await page.evaluate(() => {
    const ids = ALL_LOCATIONS.filter(l => !getSeenHistory().includes(l.id)).slice(0, 8).map(l => l.id);
    ids.forEach(recordSeenLocation);
    return ids;
  });
  await page.reload();
  const rest = await page.evaluate(() => {
    currentMode = 'classic';
    const result = [];
    for (let i = 0; i < ALL_LOCATIONS.length - 158; i++) {
      if (i % 5 === 0) gameState.usedLocIds = [];
      result.push(getNextUniqueLocation().id);
    }
    return result;
  });
  expect(new Set([...first, ...partySpots, ...rest]).size).toBe(392);
});

test('Tag-Team: viewer sees the street only, pinner sees the map only, teams share the score', async ({ browser }) => {
  const contexts = await Promise.all([0, 1, 2, 3].map(() => browser.newContext()));
  const pages = await Promise.all(contexts.map(c => c.newPage()));
  const [a] = pages;
  const errors = [];
  for (const p of pages) {
    p.on('pageerror', e => errors.push(e.message));
    await p.route('**/maps?**', r => r.fulfill({ contentType: 'text/html', body: '<p>Panorama provider stub</p>' }));
  }
  try {
    await enterHome(a);
    await a.locator('#start-screen .quick-card.pink').click();
    await a.locator('#party-mode-select').selectOption('tagteam_kh');
    await a.locator('#mp-modal button[onclick="createMultiplayerLobby()"]').click();
    await expect.poll(() => a.evaluate(() => roomReady)).toBe(true);
    const code = await a.locator('#room-code-text').innerText();
    for (const p of pages.slice(1)) await p.goto('/?room=' + code);
    for (const p of pages) await expect(p.locator('#player-count')).toHaveText('4');

    // Two teams of two are shown to everyone; only the host can swap players.
    for (const p of pages) await expect(p.locator('.lobby-team')).toHaveCount(2);
    await expect(pages[1].locator('.lobby-team-member').first()).toBeDisabled();
    const before = await a.evaluate(() => JSON.stringify(serverTeams));
    await a.locator('.lobby-team-member').nth(0).click();
    await a.locator('.lobby-team-member').nth(2).click();
    await expect.poll(() => a.evaluate(() => JSON.stringify(serverTeams))).not.toBe(before);
    expect(await pages[3].evaluate(() => JSON.stringify(serverTeams))).toBe(await a.evaluate(() => JSON.stringify(serverTeams)));

    await a.locator('#start-party-btn').click();
    for (const p of pages) await expect(p.locator('#game-screen')).toHaveClass(/active/);

    const ids = await Promise.all(pages.map(p => p.evaluate(() => myPlayerId)));
    const teams = await a.evaluate(() => serverTeams);
    for (let round = 1; round <= 6; round++) {
      for (const p of pages) {
        await p.waitForFunction(n => gameState.roundIndex === n && Date.now() + serverClockOffset >= serverMatch.startedAt, round);
      }
      const roles = await Promise.all(pages.map(p => p.evaluate(() => myRoleNow())));
      expect(roles.filter(r => r === 'viewer')).toHaveLength(2);
      expect(roles.filter(r => r === 'pinner')).toHaveLength(2);
      for (const [i, p] of pages.entries()) {
        const info = await p.evaluate(() => ({
          loc: !!gameState.currentLocation,
          src: document.getElementById('streetview-iframe').getAttribute('src'),
          planId: serverMatch.plan[serverMatch.round - 1].id,
          futureIds: serverMatch.plan.slice(serverMatch.round).filter(r => r.id).length,
          mapShown: getComputedStyle(document.getElementById('map-panel')).display !== 'none',
          streetShown: getComputedStyle(document.getElementById('streetview-container')).display !== 'none'
        }));
        expect(info.futureIds, 'future rounds are never sent').toBe(0);
        if (roles[i] === 'pinner') {
          expect(info.loc || info.planId || info.src, 'the Pinner never learns the location').toBeFalsy();
          expect(info.mapShown && !info.streetShown).toBe(true);
        } else {
          expect(info.loc && info.src).toBeTruthy();
          expect(info.streetShown && !info.mapShown).toBe(true);
        }
      }
      for (const team of teams) {
        const members = team.playerIds.map(id => ids.indexOf(id));
        const viewer = pages[members.find(i => roles[i] === 'viewer')];
        const pinner = pages[members.find(i => roles[i] === 'pinner')];
        // The teammates "talk": the Viewer's knowledge reaches the Pinner.
        const spot = await viewer.evaluate(() => ({ lat: gameState.currentLocation.lat, lng: gameState.currentLocation.lng }));
        await pinner.evaluate(ll => gameState.guessMap.fire('click', { latlng: L.latLng(ll.lat, ll.lng) }), spot);
        await pinner.locator('#guess-btn').click();
      }
      for (const p of pages) await expect(p.locator('#result-screen')).toHaveClass(/active/);
      await expect(a.locator('#mp-round-players-list .team-row')).toHaveCount(2);
      for (const p of pages) await p.locator('#res-next-btn').click();
      if (round < 6) for (const p of pages) await p.waitForFunction(n => gameState.roundIndex === n, round + 1);
    }
    for (const p of pages) await expect(p.locator('#final-screen')).toHaveClass(/active/);
    const totals = await Promise.all(pages.map(p => p.evaluate(() => gameState.totalScore)));
    expect(totals[0]).toBeGreaterThan(30000);
    for (const team of teams) {
      const [x, y] = team.playerIds.map(id => totals[ids.indexOf(id)]);
      expect(x).toBe(y);
    }
    await expect(a.locator('#fin-rounds-table .team-row')).toHaveCount(2);
    // Finished parties are saved to the party board for players who sent a device identity.
    await expect.poll(async () => {
      const res = await a.request.get('/api/leaderboard?mode=party:tagteam_kh&period=all&region=kh');
      return (await res.json()).rows.length;
    }).toBeGreaterThanOrEqual(4);
    const mine = await a.evaluate(async () => {
      const id = JSON.parse(localStorage.getItem('wanderpenh_device')).playerId;
      return (await (await fetch('/api/leaderboard?mode=party:tagteam_kh&period=all&region=kh&playerId=' + id)).json()).rows.find(r => r.isMe)?.value;
    });
    expect(mine).toBe(totals[0]);
    expect(errors).toEqual([]);
  } finally { for (const c of contexts) await c.close(); }
});
