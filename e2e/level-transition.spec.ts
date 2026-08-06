import { test, expect } from '@playwright/test';

// Levels change in place now - the world is reloaded (world.load) and the same workers are reused, rather than the
// page being reloaded.  The risk is that the worker-backed systems (ship spawning, physics) don't resync to the new
// entity set, leaving a dead battle.  This drives a real win on level 1 and proves level 2 comes up still simulating.

// The public GameScene surface this test reaches through window.__game, plus the one internal it pokes to force a
// win (removing the enemy stations).  Cast through `unknown` so it stays a precise shape rather than `any`.
interface TestGameScene {
	levelLabel: string
	gameState: 'playing' | 'won' | 'lost'
	stats: { shipsCount: number, timing: { update: { max: number } } }
	world: {
		entities: Map<number, { components: { controller?: { player?: boolean } } }>
		removeEntity(entity: unknown): void
	}
}

test('a won match advances to the next level in place with the workers still running', async({ page }) => {
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

	// Start from a clean run so the game boots on level 1, whatever the last session left saved.
	await page.addInitScript(() => localStorage.removeItem('space-auto-battler-progress'));

	// Relative so it resolves against the base path in baseURL.
	await page.goto('./');
	await expect(page.locator('#phaser-container canvas')).toBeVisible();

	// Wait until the world has actually simulated a tick (update timing goes non-zero only after real runs), so the
	// battle is live before we end it.
	await page.waitForFunction(() => {
		const scene = window.__game?.scene.getScene('game') as unknown as TestGameScene | null;
		return (scene?.stats.timing.update.max ?? 0) > 0 && (scene?.levelLabel ?? '').startsWith('Level 1');
	}, undefined, { timeout: 15000 });

	// Force the win: remove every enemy station (a controller not flagged `player`).  checkForGameOver sees no
	// enemies left on the next frame and starts the automatic advance to level 2.
	await page.evaluate(() => {
		const scene = window.__game?.scene.getScene('game') as unknown as TestGameScene | undefined;
		if(!scene) {
			throw new Error('game scene not found');
		}
		for(const entity of Array.from(scene.world.entities.values())) {
			if(entity.components.controller && !entity.components.controller.player) {
				scene.world.removeEntity(entity);
			}
		}
	});

	// The advance holds a short beat, then swaps the world to level 2 in place (no navigation).
	await page.waitForFunction(() => {
		const scene = window.__game?.scene.getScene('game') as unknown as TestGameScene | null;
		return (scene?.levelLabel ?? '').startsWith('Level 2');
	}, undefined, { timeout: 8000 });

	// The new level must be live: back to playing, and its own ships spawning - which only happens if the spawn and
	// physics workers resynced to the reloaded entity set.
	await page.waitForFunction(() => {
		const scene = window.__game?.scene.getScene('game') as unknown as TestGameScene | null;
		return scene?.gameState === 'playing' && (scene?.stats.shipsCount ?? 0) > 0;
	}, undefined, { timeout: 10000 });

	// It never navigated away, so the game instance is the same one we started with.
	expect(await page.evaluate(() => !!window.__game)).toBe(true);

	expect(pageErrors, `Unexpected page errors:\n${pageErrors.join('\n')}`).toEqual([]);
	expect(consoleErrors, `Unexpected console errors:\n${consoleErrors.join('\n')}`).toEqual([]);
});
