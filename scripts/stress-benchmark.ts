// Runs the /stress-test level headlessly with its systems on real worker threads - the same multi-threaded setup
// the browser uses when you open http://127.0.0.1:8080/stress-test/index.html - for a fixed wall-clock duration,
// then prints the per-system timing stats you see in-browser by pressing the ` key (worker run time vs the
// main-thread cost of handling each worker's events), plus the main-thread update, entity counts, and memory.
//
// It is the real GameWorld + real system workers; only the render/HUD layer is absent.  shared-memory-ecs runs a
// system off-thread when `globalThis.Worker` + `SharedArrayBuffer` exist, so this sets `Worker` (Node has
// SharedArrayBuffer already) and the `?worker` imports resolve to node:worker_threads Workers via the loader this
// is launched with (see scripts/worker-threads/*).
//
// Run with `npm run benchmark:stress [-- seconds [seed]]` (defaults: 15s, seed 1).
import { performance } from 'node:perf_hooks';
// Type-only, so this is erased at runtime and never pulls the Phaser-bound game-scene module into Node.
import type { GameStats } from '@/game/game-scene';

// shared-memory-ecs picks the worker backend the instant a system is constructed (inside `new GameWorld`), so this
// flag must be set before that import's factories run.  Any defined value works; the library only checks it exists.
(globalThis as { Worker?: unknown }).Worker ??= class {};

const { PerformanceTiming } = await import('@daneren2005/shared-memory-ecs');
const { default: GameWorld } = await import('@/game/entities/game-world');
const { default: entityList } = await import('@/game/entities/entity-list');
const { default: formatStats } = await import('@/game/format-stats');
const { default: prettyMemory } = await import('@/data/pretty-memory');
const { stressTestLevel } = await import('@/data/levels/stress-test');
type PerformanceStats = GameStats['timing'];

const DEFAULT_SECONDS = 15;
const DEFAULT_SEED = 1;
const STEP_MS = 1000 / 60;
// Keeps one stalled frame (GC, thread contention) from stepping the sim so far ships teleport - the browser loop
// clamps its delta the same way.  Timing is measured by the clock inside each system, not this delta, so capping
// it does not distort the numbers.
const MAX_STEP_MS = 100;

interface Snapshot {
	atMs: number
	ships: number
	total: number
	mainThreadMax: number
}

function readNumber(value: string | undefined, fallback: number, label: string): number {
	if(value === undefined) {
		return fallback;
	}
	const parsed = Number(value);
	if(!Number.isFinite(parsed) || parsed <= 0) {
		throw new Error(`${label} must be a positive number, received: ${value}`);
	}
	return parsed;
}

function delay(ms: number): Promise<void> {
	return new Promise(resolve => {
		setTimeout(resolve, ms);
	});
}

function counts(world: InstanceType<typeof GameWorld>): { stations: number, ships: number } {
	const entities = entityList(world);
	const stations = entities.filter(entity => !!entity.components.controller);
	const ships = entities.filter(entity => !!entity.components.controlled && !entity.components.projectile);
	return { stations: stations.length, ships: ships.length };
}

async function main(): Promise<void> {
	const seconds = readNumber(process.argv[2], DEFAULT_SECONDS, 'seconds');
	const seed = process.argv[3] === undefined ? DEFAULT_SEED : readNumber(process.argv[3], DEFAULT_SEED, 'seed');
	const durationMs = seconds * 1000;

	const world = new GameWorld(seed);
	const timing = new PerformanceTiming(world);

	world.load({ entities: stressTestLevel.entities, bounds: stressTestLevel.bounds });
	await world.init();

	process.stdout.write(
		`Stress benchmark: ${stressTestLevel.entities.length} factions, seed ${seed}, running ${seconds}s on `
		+ `${world.systems.length} systems across worker threads...\n`,
	);

	const startedAt = performance.now();

	// Report window rolls once per game-second (the library default), the same cadence the in-browser display uses.
	const snapshots: Array<Snapshot> = [];
	timing.on('stats-updated', (stats: PerformanceStats) => {
		const { ships } = counts(world);
		snapshots.push({
			atMs: performance.now() - startedAt,
			ships,
			total: world.entities.size,
			mainThreadMax: stats.update.max,
		});
	});

	let last = startedAt;
	let frames = 0;
	// A self-correcting real-time loop (not a tight for-loop): worker results settle on the event loop between
	// frames, so the loop must yield to it - exactly how the browser's requestAnimationFrame loop drives the game.
	for(;;) {
		const now = performance.now();
		if(now - startedAt >= durationMs) {
			break;
		}
		const delta = Math.min(MAX_STEP_MS, now - last);
		last = now;
		world.update(delta);
		frames++;

		const spent = performance.now() - now;
		await delay(Math.max(0, STEP_MS - spent));
	}
	const elapsedMs = performance.now() - startedAt;

	const { stations, ships } = counts(world);
	const stats: GameStats = {
		fps: frames / (elapsedMs / 1000),
		timing: timing.stats,
		memory: prettyMemory(world.heap),
		stationsCount: stations,
		shipsCount: ships,
		totalCount: world.entities.size,
		stationShips: [],
	};

	process.stdout.write('\n');
	process.stdout.write(formatStats(stats));
	process.stdout.write('\n\n');
	process.stdout.write(`Frames: ${frames} over ${(elapsedMs / 1000).toFixed(1)}s\n`);
	if(snapshots.length) {
		process.stdout.write('\nLoad over time (per ~1s window):\n');
		process.stdout.write('   t(s)   ships   total   mainThread max ms\n');
		for(const snapshot of snapshots) {
			process.stdout.write(
				`  ${(snapshot.atMs / 1000).toFixed(1).padStart(5)}  ${String(snapshot.ships).padStart(6)}  `
				+ `${String(snapshot.total).padStart(6)}  ${snapshot.mainThreadMax.toFixed(2).padStart(8)}\n`,
			);
		}
	}

	timing.destroy();
	world.destroy();
	// Give the just-terminated worker threads a tick to unwind before the process exits.
	await delay(50);
}

await main();
process.exit(0);
