import { InterpolationSystem } from '@daneren2005/shared-memory-physics';
import type { BaseWorld } from '@daneren2005/shared-memory-ecs';
import type { Components, registry } from '../components';

// Physics runs on a fixed 50ms step, so a sprite drawn straight off the transform stutters. This fills in a
// per-frame render position lerped between the two positions physics published either side of its last step.
// Runs on the main thread (where the sprites are) and is wired to nothing: each physics run publishes both
// positions and the time between them into the entity's block, which is all the pacing reads. A physics run
// takes tens of ms, so pacing off when it was posted (not when it landed) would draw ships backwards each step.
export function createInterpolationSystem(world: BaseWorld<typeof registry>): InterpolationSystem<Components> {
	return new InterpolationSystem<Components>(world, {
		name: 'interpolationSystem',
	});
}

export default createInterpolationSystem;
