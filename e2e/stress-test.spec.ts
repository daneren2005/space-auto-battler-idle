import { test, expect } from '@playwright/test';

// The stress-test page is a second entry point (stress-test/index.html -> src/stress-test.ts) rather than a route
// the game page handles, so this checks the built page really is served at /stress-test/ and boots a live world
// with all ten factions in it.
test('the stress test level loads ten factions and simulates them', async ({ page }) => {
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
	await page.goto('./stress-test/');

	const canvas = page.locator('#phaser-container canvas');
	await expect(canvas).toBeVisible();

	// A thousand ships is only worth measuring with the SharedArrayBuffer workers actually running.
	expect(await page.evaluate(() => window.crossOriginIsolated)).toBe(true);

	// Every station exists from the moment the level is loaded, and the scene pushes a stats snapshot right then -
	// so this is checked before any of them can be destroyed.
	await page.waitForFunction(() => {
		const scene = window.__game?.scene.getScene('game') as { stats?: { stationsCount: number } } | null;
		return typeof scene?.stats?.stationsCount === 'number' && scene.stats.stationsCount > 0;
	}, undefined, { timeout: 15000 });
	const stations = await page.evaluate(() => {
		const scene = window.__game?.scene.getScene('game') as { stats?: { stationsCount: number } } | null;
		return scene?.stats?.stationsCount;
	});
	expect(stations).toBe(10);

	// Every station launches a hundred ships a second, so a few hundred of them proves both that the spawn system
	// is running and that the world is simulating.  The stats snapshot only refreshes about once a second, hence
	// the generous timeout.
	await page.waitForFunction(() => {
		const scene = window.__game?.scene.getScene('game') as {
			stats?: { shipsCount: number, timing: { update: { max: number } } }
		} | null;
		return !!scene?.stats && scene.stats.shipsCount > 300 && scene.stats.timing.update.max > 0;
	}, undefined, { timeout: 30000 });

	expect(pageErrors, `Unexpected page errors:\n${pageErrors.join('\n')}`).toEqual([]);
	expect(consoleErrors, `Unexpected console errors:\n${consoleErrors.join('\n')}`).toEqual([]);
});
