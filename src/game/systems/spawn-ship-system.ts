import type { BaseWorld } from '@daneren2005/shared-memory-ecs';
import type { registry, ComponentArrays } from '../components';
import GameEntityWorkerSystem, { readSeed } from './game-entity-worker-system';
import { spawnShipUpdate } from './spawn-ship-update';
import type { SeededWorld } from './seeded-world';
import SpawnShipWorker from './spawn-ship.worker?worker';

// Stations launch ships from their hangar production lines.
export function createSpawnShipSystem(world: BaseWorld<typeof registry>) {
	return new GameEntityWorkerSystem<Pick<ComponentArrays, 'hangar' | 'transform' | 'body'>, SeededWorld>(world, {
		name: 'spawnShipSystem',
		// body is required because a spawned ship inherits its station's collide category + mask.
		required: ['hangar', 'transform', 'body'],
		updateFunction: spawnShipUpdate,
		// Ships are created off-thread from factory configs, so this worker gets the templates shipped on load.
		createsEntities: true,
		getWorker: () => new SpawnShipWorker(),
		getInitData: () => ({ seed: readSeed(world) }),
	});
}
