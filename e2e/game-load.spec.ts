import { test, expect } from '@playwright/test';

test('the game loads without any errors', async ({ page }) => {
	const consoleErrors: Array<string> = [];
	const pageErrors: Array<string> = [];

	page.on('console', message => {
		if(message.type() === 'error') {
			consoleErrors.push(message.text());
		}
	});
	page.on('pageerror', error => {
		pageErrors.push(error.stack ?? error.message);
	});

	// Relative so it resolves against the base path in baseURL (goto('/') would drop the subpath).
	await page.goto('./');

	// Phaser renders the game into this container, so a canvas appearing means the scene booted.
	const canvas = page.locator('#phaser-container canvas');
	await expect(canvas).toBeVisible();

	// SharedArrayBuffer-backed workers only run when the page is cross-origin isolated.
	expect(await page.evaluate(() => window.crossOriginIsolated)).toBe(true);

	// The stats now render into the Phaser canvas (which the DOM can't read), so read them straight off the live
	// GameScene instead.  maxUpdateTime starts at 0 and only becomes non-zero after the world has run real
	// simulation ticks (its first ~1s reporting window), so waiting for it proves the game loop is live - not
	// just mounted.  main.ts hangs the running game off window.__game for exactly this purpose.
	await page.waitForFunction(() => {
		const scene = window.__game?.scene.getScene('game') as { stats?: { maxUpdateTime: number } } | null;
		return typeof scene?.stats?.maxUpdateTime === 'number' && scene.stats.maxUpdateTime > 0;
	}, undefined, { timeout: 15000 });

	expect(pageErrors, `Unexpected page errors:\n${pageErrors.join('\n')}`).toEqual([]);
	expect(consoleErrors, `Unexpected console errors:\n${consoleErrors.join('\n')}`).toEqual([]);
});
