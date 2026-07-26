import type { BaseWorld } from '@daneren2005/shared-memory-ecs';
import type { registry } from '../components';
import GameComponentSystem from './game-component-system';
import { collisionUpdate } from './collision-update';
import CollisionWorker from './collision.worker?worker';

// Resolve collisions, damage, deaths and bounties.
export function createCollisionSystem(world: BaseWorld<typeof registry>) {
	return new GameComponentSystem(world, {
		name: 'collisionSystem',
		required: ['velocity', 'position', 'health', 'controlled', 'entity'],
		updateFunction: collisionUpdate,
		getWorker: () => new CollisionWorker(),
		queries: {
			collidable: { required: ['position', 'health', 'entity'], optional: ['controller', 'controlled'] },
		},
	});
}
