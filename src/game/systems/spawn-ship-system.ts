import type { BaseWorld } from '@daneren2005/shared-memory-ecs';
import type { registry, ComponentArrays } from '../components';
import GameComponentSystem, { readSeed } from './game-component-system';
import { spawnShipUpdate } from './spawn-ship-update';
import type { SeededWorld } from './seeded-world';
import SpawnShipWorker from './spawn-ship.worker?worker';

// Stations launch ships from their hangar production lines.
export function createSpawnShipSystem(world: BaseWorld<typeof registry>) {
	return new GameComponentSystem<Pick<ComponentArrays, 'hangar' | 'transform' | 'body'>, SeededWorld>(world, {
		name: 'spawnShipSystem',
		// body is required because a spawned ship inherits its station's collide category + mask.
		required: ['hangar', 'transform', 'body'],
		updateFunction: spawnShipUpdate,
		getWorker: () => new SpawnShipWorker(),
		getInitData: () => ({ seed: readSeed(world) }),
	});
}
