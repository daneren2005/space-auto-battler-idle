import { ComponentSystem } from '@daneren2005/shared-memory-ecs';
import type { ComponentSystemWorld, EntityUpdateComponents } from '@daneren2005/shared-memory-ecs';
import type { Components } from '../components';

export interface Bounds {
	width: number
	height: number
}

export interface CustomSystemWorld extends ComponentSystemWorld {
	bounds: Bounds
}

// `bounds` is stored on the game world (see GameWorld); read it without importing GameWorld to avoid an
// import cycle between the world and its systems.  Shared with the physics system, which is not a
// GameComponentSystem but needs the same per-run data.
export function readBounds(world: unknown): Bounds {
	return (world as { bounds: Bounds }).bounds;
}

// A single concrete ComponentSystem used by every game specific system in this game.  It only adds the world's
// `bounds` to the per-run data object so worker update functions can keep entities on screen; everything else
// about a system (its query, update function, and worker) is supplied through the normal ComponentSystem
// options.  `T` is the set of component blocks the system's update function touches, inferred from its
// updateFunction.
export default class GameComponentSystem<T extends EntityUpdateComponents<Components>> extends ComponentSystem<Components, T, CustomSystemWorld> {
	addDataToWorld(world: CustomSystemWorld): void {
		world.bounds = readBounds(this.world);
	}
}
