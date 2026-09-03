import type { BaseWorld } from '@daneren2005/shared-memory-ecs';
import type { registry } from '../components';
import GameEntityWorkerSystem from './game-entity-worker-system';
import { moveToTargetUpdate } from './move-to-target-update';
import MoveToTargetWorker from './move-to-target.worker?worker';

// Steer each ship toward its target.
export function createMoveToTargetSystem(world: BaseWorld<typeof registry>) {
	return new GameEntityWorkerSystem(world, {
		name: 'moveToTargetSystem',
		required: ['velocity', 'attack', 'transform'],
		updateFunction: moveToTargetUpdate,
		getWorker: () => new MoveToTargetWorker(),
		queries: {
			targets: { required: ['transform'] },
		},
	});
}
