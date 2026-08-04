import type { BaseWorld } from '@daneren2005/shared-memory-ecs';
import type { registry } from '../components';
import GameComponentSystem from './game-component-system';
import { updateProjectilesUpdate } from './update-projectiles-update';
import UpdateProjectilesWorker from './update-projectiles.worker?worker';

// Expire projectiles when their lifetime runs out, and steer the homing ones toward their target.
export function createUpdateProjectilesSystem(world: BaseWorld<typeof registry>) {
	return new GameComponentSystem(world, {
		name: 'updateProjectilesSystem',
		required: ['projectile', 'transform', 'velocity'],
		// `entity` is what killEntityWorker flags dead; it lives outside this game's registry so it is requested
		// here as an optional block rather than a required one.
		optional: ['entity'],
		updateFunction: updateProjectilesUpdate,
		getWorker: () => new UpdateProjectilesWorker(),
		queries: {
			// Every possible target's position, so a homing shot can look up whoever it is chasing.
			targets: { required: ['transform'] },
		},
	});
}
