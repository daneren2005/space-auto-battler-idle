import { PhysicsSystem } from '@daneren2005/shared-memory-physics';
import type { PhysicalWorld } from '@daneren2005/shared-memory-physics';
import type { Components, registry } from '../components';
import type { CustomSystemWorld } from './game-entity-worker-system';
import { readBounds } from './game-entity-worker-system';
import { physicsUpdate, type GamePhysicsComponents } from './physics-update';
import PhysicsWorker from './physics.worker?worker';

// The library's PhysicsSystem with this game's `bounds` added, which physicsUpdate needs to bounce ships off walls.
export class GamePhysicsSystem extends PhysicsSystem<Components, GamePhysicsComponents, CustomSystemWorld> {
	addDataToWorld(world: CustomSystemWorld): void {
		// super stamps the run's step number (interpolation blocks publish under it), so this adds, not replaces.
		super.addDataToWorld(world);

		world.bounds = readBounds(this.world);
	}
}

// Moves every ship, keeps it on the map, and resolves collisions/damage/deaths/bounties against where it lands.
export function createPhysicsSystem(world: PhysicalWorld<typeof registry>): GamePhysicsSystem {
	return new GamePhysicsSystem(world, {
		name: 'physicsSystem',
		// The same update the worker hands to createEntitySystemWorker, so both backends behave identically.
		updateFunction: physicsUpdate,
		getWorker: () => new PhysicsWorker(),
	});
}
