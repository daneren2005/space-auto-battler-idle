import type { BaseWorld } from '@daneren2005/shared-memory-ecs';
import type { registry } from '../components';
import GameComponentSystem from './game-component-system';
import { targetEnemyUpdate } from './target-enemy-update';
import TargetEnemyWorker from './target-enemy.worker?worker';

// Pick a target for every ship.
export function createTargetEnemySystem(world: BaseWorld<typeof registry>) {
	return new GameComponentSystem(world, {
		name: 'targetEnemySystem',
		required: ['velocity', 'attack', 'position', 'controlled'],
		updateFunction: targetEnemyUpdate,
		getWorker: () => new TargetEnemyWorker(),
		queries: {
			collidable: { required: ['position', 'health'], optional: ['controller', 'controlled'] },
			stations: { required: ['controller', 'position'] },
		},
	});
}
