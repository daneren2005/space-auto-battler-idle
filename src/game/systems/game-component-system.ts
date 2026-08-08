import { ComponentSystem } from '@daneren2005/shared-memory-ecs';
import type { EntityUpdateComponents } from '@daneren2005/shared-memory-ecs';
import type { PhysicsWorld } from '@daneren2005/shared-memory-physics';
import type { Components } from '../components';

export interface Bounds {
	width: number
	height: number
}

// Built on PhysicsWorld so one shape covers every system: `tick` is what PhysicsSystem stamps for interpolation,
// and non-physics systems simply never read it.
export interface CustomSystemWorld extends PhysicsWorld {
	bounds: Bounds
}

// Reads `bounds` off the game world without importing GameWorld (avoids an import cycle). Shared with the
// physics system, which isn't a GameComponentSystem but needs the same per-run data.
export function readBounds(world: unknown): Bounds {
	return (world as { bounds: Bounds }).bounds;
}

// Reads the world's deterministic RNG seed
export function readSeed(world: unknown): number {
	return (world as { seed: number }).seed;
}

// Base ComponentSystem for every game system; it only adds the world's `bounds` to the per-run data so update
// functions can keep entities on screen. Generic over the world so a system whose worker builds extra per-run
// state (e.g. a seeded RNG merged in via updateFunction.init) can widen it beyond CustomSystemWorld.
export default class GameComponentSystem<T extends EntityUpdateComponents<Components>, W extends CustomSystemWorld = CustomSystemWorld> extends ComponentSystem<Components, T, W> {
	addDataToWorld(world: W): void {
		world.bounds = readBounds(this.world);
	}
}
