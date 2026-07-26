import type { BaseWorld } from '@daneren2005/shared-memory-ecs';
import type { registry } from '../components';
import GameComponentSystem from './game-component-system';
import { updateHealthTimersUpdate } from './update-health-timers-update';
import UpdateHealthTimersWorker from './update-health-timers.worker?worker';

// Regenerate shields + tick the damage-cooldown timers.
export function createUpdateHealthTimersSystem(world: BaseWorld<typeof registry>) {
	return new GameComponentSystem(world, {
		name: 'updateHealthTimersSystem',
		required: ['health'],
		updateFunction: updateHealthTimersUpdate,
		getWorker: () => new UpdateHealthTimersWorker(),
	});
}
