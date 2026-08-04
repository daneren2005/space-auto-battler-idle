import type { BaseWorld } from '@daneren2005/shared-memory-ecs';
import type { registry } from '../components';
import GameComponentSystem from './game-component-system';
import { weaponUpdate } from './weapon-update';
import WeaponWorker from './weapon.worker?worker';

// Fire each armed ship's weapon at its target.  Only ships with a weapon are processed; `attack` supplies the
// target the targeting system chose, `controlled` the owner a shot's kills pay out to, and `body` the collide
// category + mask a shot inherits so it hits the same enemies the ship does.
export function createWeaponSystem(world: BaseWorld<typeof registry>) {
	return new GameComponentSystem(world, {
		name: 'weaponSystem',
		required: ['weapon', 'attack', 'transform', 'body', 'controlled'],
		updateFunction: weaponUpdate,
		getWorker: () => new WeaponWorker(),
		queries: {
			// Every possible target's position, so a firing ship can aim at whoever it is targeting.
			targets: { required: ['transform'] },
		},
	});
}
