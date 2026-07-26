import type { BaseWorld } from '@daneren2005/shared-memory-ecs';
import type { registry } from '../components';
import GameComponentSystem from './game-component-system';
import { spawnShipUpdate } from './spawn-ship-update';
import SpawnShipWorker from './spawn-ship.worker?worker';

// Spend money to spawn ships.
export function createSpawnShipSystem(world: BaseWorld<typeof registry>) {
	return new GameComponentSystem(world, {
		name: 'spawnShipSystem',
		required: ['controller', 'position'],
		updateFunction: spawnShipUpdate,
		getWorker: () => new SpawnShipWorker(),
	});
}
