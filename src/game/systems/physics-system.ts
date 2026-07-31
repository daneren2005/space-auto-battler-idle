import { PhysicsSystem } from '@daneren2005/shared-memory-physics';
import type { BaseWorld } from '@daneren2005/shared-memory-ecs';
import type { Components, registry } from '../components';
import type { CustomSystemWorld } from './game-component-system';
import { readBounds } from './game-component-system';
import { physicsUpdate, type GamePhysicsComponents } from './physics-update';
import PhysicsWorker from './physics.worker?worker';

// The library's PhysicsSystem, with this game's `bounds` added to the per-run data object the same way
// GameComponentSystem does it - physicsUpdate needs them to bounce ships off the edge of the map.
class GamePhysicsSystem extends PhysicsSystem<Components, GamePhysicsComponents, CustomSystemWorld> {
	addDataToWorld(world: CustomSystemWorld): void {
		world.bounds = readBounds(this.world);
	}
}

// Move every ship, keep it on the map, and resolve the collisions, damage, deaths and bounties that come out of
// where it ends up.  This one system replaces the separate velocity + collision systems this game used to run:
// collisions are found as each ship moves, against the position it actually moved to.
export function createPhysicsSystem(world: BaseWorld<typeof registry>) {
	return new GamePhysicsSystem(world, {
		name: 'physicsSystem',
		// The same update the worker file hands to createComponentWorker, so both backends behave identically.  It
		// carries the components + collidable query it needs, so neither has to be repeated here.
		updateFunction: physicsUpdate,
		getWorker: () => new PhysicsWorker(),
	});
}
