import { test, expect } from '@playwright/test';

test('changing headwear in the lobby is seen by the other browser; locked frames stay locked', async ({ browser }) => {
  const ca = await browser.newContext({ viewport: { width: 1100, height: 900 } }), cb = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  const a = await ca.newPage(), b = await cb.newPage();
  for (const p of [a, b]) await p.route('**/maps?**', r => r.fulfill({ contentType: 'text/html', body: 'x' }));
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

    await b.getByRole('button', { name: 'Customize your lobby character' }).click();
    await b.locator('#profile-name-input').fill('Hat person');
    await b.locator('.studio-tab-btn[data-cat="hair"]').click();
    await b.locator('.studio-thumb[data-slot="headwear"][data-id="crown"]').click();
    // A locked frame cannot be equipped by clicking it, and the editor says why.
    await b.locator('.studio-tab-btn[data-cat="extras"]').click();
    await expect(b.locator('.studio-thumb[data-slot="frame"][data-id="royale"] .studio-lock')).toBeVisible();
    await b.locator('.studio-thumb[data-slot="frame"][data-id="royale"]').click();
    expect(await b.evaluate(() => editingAvatarFrame())).toBe('plain');
    await b.locator('.studio-thumb[data-slot="frame"][data-id="lotusRing"]').click();
    // Undo walks back one change, Reset restores the defaults.
    await b.locator('#profile-modal button[onclick="undoStudio()"]').click();
    expect(await b.evaluate(() => editingAvatarFrame())).toBe('plain');
    await b.locator('#profile-modal button[onclick="saveProfile()"]').click();
    await expect.poll(() => a.evaluate(() => getLobbyPlayers().find(p => p.name === 'Hat person')?.avatarConfig.headwear)).toBe('crown');
    await expect.poll(() => a.evaluate(() => getLobbyPlayers().find(p => p.name === 'Hat person')?.avatarConfig.frame)).toBe('plain');
    await expect(a.locator('#lobby-players-container')).toContainText('Hat person');
  } finally { await ca.close(); await cb.close(); }
});
