import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
	resolve: {
		alias: {
			'@': fileURLToPath(new URL('./src', import.meta.url)),
		},
		// shared-memory-physics is linked in from a sibling checkout and would otherwise load its own copies of
		// these two peer dependencies, so the world under test and the physics system would not share a heap.
		dedupe: [
			'@daneren2005/shared-memory-ecs',
			'@daneren2005/shared-memory-objects',
		],
	},
	test: {
		globals: true,
		environment: 'node',
		include: ['src/**/*.spec.ts'],
		// Deliberately no `setupFiles: ['@vitest/web-worker']`.  With no `Worker` global, shared-memory-ecs runs
		// every EntityWorkerSystem's update function in-process instead of posting it to a worker, so `world.update()`
		// resolves a whole frame synchronously and the game-loop tests stay deterministic.  Emulated workers made
		// world creation depend on the module runner re-importing each `*.worker.ts` per instance, which hung
		// (forever, until the test timeout) for every world after the first one on CI.  The real worker path is
		// covered by the Playwright E2E tests, which run the built app in a browser.
	},
});
