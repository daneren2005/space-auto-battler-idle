import type { BaseWorld } from '@daneren2005/shared-memory-ecs';
import type { registry } from '../components';
import GameEntityWorkerSystem from './game-entity-worker-system';
import { targetEnemyUpdate } from './target-enemy-update';
import TargetEnemyWorker from './target-enemy.worker?worker';

// Pick a target for every ship.
export function createTargetEnemySystem(world: BaseWorld<typeof registry>) {
	return new GameEntityWorkerSystem(world, {
		name: 'targetEnemySystem',
		required: ['velocity', 'attack', 'transform', 'controlled'],
		updateFunction: targetEnemyUpdate,
		getWorker: () => new TargetEnemyWorker(),
		queries: {
			// `body` tells the spatial index a station's outline (circle vs square).
			collidable: { required: ['transform', 'health'], optional: ['body', 'controller', 'controlled'] },
			stations: { required: ['controller', 'transform'] },
		},
	});
}
