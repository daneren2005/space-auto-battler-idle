import type { BaseWorld } from '@daneren2005/shared-memory-ecs';
import type { registry } from '../components';
import GameComponentSystem from './game-component-system';
import { velocityUpdate } from './velocity-update';
import VelocityWorker from './velocity.worker?worker';

// Move everything and bounce it off the walls.
export function createVelocitySystem(world: BaseWorld<typeof registry>) {
	return new GameComponentSystem(world, {
		name: 'velocitySystem',
		required: ['position', 'velocity'],
		updateFunction: velocityUpdate,
		getWorker: () => new VelocityWorker(),
	});
}
