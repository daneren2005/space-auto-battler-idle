import { InterpolationSystem } from '@daneren2005/shared-memory-physics';
import type { BaseWorld } from '@daneren2005/shared-memory-ecs';
import type { Components, registry } from '../components';

// Physics runs on a fixed 50ms step, so a ship's transform only changes on one frame in three and a sprite
// drawn straight off it stutters.  This fills in a render position that changes every frame instead, blended
// between the two positions physics published either side of its last step - so the fleet moves smoothly while
// the simulation underneath it stays at 20Hz.
//
// It runs on the main thread, which is where the sprites are: the work is one lerp per interpolated entity per
// frame, against a broadphase and a sweep per entity per step for the physics it is decoupling the frame rate
// from.
//
// It is wired to nothing - not even to the physics system it is smoothing.  Each physics run publishes the two
// positions and how much simulated time lies between them into the entity's own block, and that is the whole of
// what the pacing is driven by.  That matters here specifically: a physics run in this game takes tens of
// milliseconds on its worker, so when it *lands* is not when it was *posted*, and anything pacing off the
// posting side draws a ship backwards on every step.
export function createInterpolationSystem(world: BaseWorld<typeof registry>): InterpolationSystem<Components> {
	return new InterpolationSystem<Components>(world, {
		name: 'interpolationSystem',
	});
}

export default createInterpolationSystem;
