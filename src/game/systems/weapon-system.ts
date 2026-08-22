import type { BaseWorld } from '@daneren2005/shared-memory-ecs';
import type { registry } from '../components';
import GameComponentSystem from './game-component-system';
import { weaponUpdate } from './weapon-update';
import WeaponWorker from './weapon.worker?worker';

// Fires each armed ship's weapon at its target.
export function createWeaponSystem(world: BaseWorld<typeof registry>) {
	return new GameComponentSystem(world, {
		name: 'weaponSystem',
		required: ['weapon', 'attack', 'transform', 'body', 'controlled'],
		updateFunction: weaponUpdate,
		// Projectiles + drones are created off-thread from factory configs.
		createsEntities: true,
		getWorker: () => new WeaponWorker(),
		queries: {
			targets: { required: ['transform'] },
		},
	});
}
