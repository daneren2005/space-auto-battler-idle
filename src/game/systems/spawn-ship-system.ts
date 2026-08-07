import type { BaseWorld } from '@daneren2005/shared-memory-ecs';
import type { registry } from '../components';
import GameComponentSystem from './game-component-system';
import { spawnShipUpdate } from './spawn-ship-update';
import SpawnShipWorker from './spawn-ship.worker?worker';

// Stations launch ships from their hangar production lines.
export function createSpawnShipSystem(world: BaseWorld<typeof registry>) {
	return new GameComponentSystem(world, {
		name: 'spawnShipSystem',
		// body is required because a spawned ship inherits its station's collide category + mask.
		required: ['hangar', 'transform', 'body'],
		updateFunction: spawnShipUpdate,
		getWorker: () => new SpawnShipWorker(),
	});
}
