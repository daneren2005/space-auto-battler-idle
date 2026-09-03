import type { BaseWorld } from '@daneren2005/shared-memory-ecs';
import type { registry } from '../components';
import GameEntityWorkerSystem from './game-entity-worker-system';
import { updateProjectilesUpdate } from './update-projectiles-update';
import UpdateProjectilesWorker from './update-projectiles.worker?worker';

// Expire projectiles when their lifetime runs out, and steer the homing ones toward their target.
export function createUpdateProjectilesSystem(world: BaseWorld<typeof registry>) {
	return new GameEntityWorkerSystem(world, {
		name: 'updateProjectilesSystem',
		required: ['projectile', 'transform', 'velocity'],
		// `entity` is what killEntityWorker flags dead; outside this registry, so requested as optional.
		optional: ['entity'],
		updateFunction: updateProjectilesUpdate,
		getWorker: () => new UpdateProjectilesWorker(),
		queries: {
			targets: { required: ['transform'] },
		},
	});
}
