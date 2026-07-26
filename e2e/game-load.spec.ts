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

	// Wait for the stats panel to report live entities, proving the world actually spun up and
	// ran at least one simulation tick rather than just mounting an empty scene.
	await expect(page.getByText(/\d+ stations and \d+ ships/)).toBeVisible();
	await expect(page.getByText(/[1-9]\d* stations and [1-9]\d* ships/)).toBeVisible();

	expect(pageErrors, `Unexpected page errors:\n${pageErrors.join('\n')}`).toEqual([]);
	expect(consoleErrors, `Unexpected console errors:\n${consoleErrors.join('\n')}`).toEqual([]);
});
