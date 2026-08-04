import { test, expect } from '@playwright/test';

// The ship-test page is a third entry point (ship-test/index.html -> src/ship-test.ts) rather than a route the
// game page handles, so this checks the built page really is served at /ship-test/ and boots a live 1v1 with both
// stations fielding the whole roster.
test('the ship test level loads a 1v1 and fields the whole roster', async ({ page }) => {
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

	// Relative so it resolves against the base path in baseURL.
	await page.goto('./ship-test/');

	const canvas = page.locator('#phaser-container canvas');
	await expect(canvas).toBeVisible();

	// The ships only actually simulate with the SharedArrayBuffer workers running.
	expect(await page.evaluate(() => window.crossOriginIsolated)).toBe(true);

	// Exactly the two stations of a 1v1, present from the moment the level loads.
	await page.waitForFunction(() => {
		const scene = window.__game?.scene.getScene('game') as { stats?: { stationsCount: number } } | null;
		return typeof scene?.stats?.stationsCount === 'number' && scene.stats.stationsCount > 0;
	}, undefined, { timeout: 15000 });
	const stations = await page.evaluate(() => {
		const scene = window.__game?.scene.getScene('game') as { stats?: { stationsCount: number } } | null;
		return scene?.stats?.stationsCount;
	});
	expect(stations).toBe(2);

	// Both stations build ten types at a ship a second each, so a couple of dozen ships proves the roster is being
	// spawned and the world is simulating.  The stats snapshot only refreshes about once a second, hence the
	// generous timeout.
	await page.waitForFunction(() => {
		const scene = window.__game?.scene.getScene('game') as {
			stats?: { shipsCount: number, timing: { update: { max: number } } }
		} | null;
		return !!scene?.stats && scene.stats.shipsCount > 20 && scene.stats.timing.update.max > 0;
	}, undefined, { timeout: 20000 });

	expect(pageErrors, `Unexpected page errors:\n${pageErrors.join('\n')}`).toEqual([]);
	expect(consoleErrors, `Unexpected console errors:\n${consoleErrors.join('\n')}`).toEqual([]);
});
