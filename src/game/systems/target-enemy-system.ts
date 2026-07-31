import type { BaseWorld } from '@daneren2005/shared-memory-ecs';
import type { registry } from '../components';
import GameComponentSystem from './game-component-system';
import { targetEnemyUpdate } from './target-enemy-update';
import TargetEnemyWorker from './target-enemy.worker?worker';

// Pick a target for every ship.
export function createTargetEnemySystem(world: BaseWorld<typeof registry>) {
	return new GameComponentSystem(world, {
		name: 'targetEnemySystem',
		required: ['velocity', 'attack', 'transform', 'controlled'],
		updateFunction: targetEnemyUpdate,
		getWorker: () => new TargetEnemyWorker(),
		queries: {
			// `body` only says which outline the transform describes, so the spatial index files a circular
			// station under a circle rather than under the square it fits inside.
			collidable: { required: ['transform', 'health'], optional: ['body', 'controller', 'controlled'] },
			stations: { required: ['controller', 'transform'] },
		},
	});
}
