import type { ComponentsOf, EntityConfigOf } from '@daneren2005/shared-memory-ecs';
import { physicsRegistry } from '@daneren2005/shared-memory-physics';
import { healthDefinition } from './health';
import { controllerDefinition } from './controller';
import { controlledDefinition } from './controlled';
import { attackDefinition } from './attack';

// One place declares every component; the world derives its typed component map + flat entity config from it.
// `transform` (where/how big/facing), `velocity` and `body` (what shape, what it collides with) all come from
// shared-memory-physics - the same library supplies the PhysicsSystem that reads them - so this game only
// declares what is specific to it.  Each of those lives in its own file in this folder.
export const registry = {
	...physicsRegistry,
	health: healthDefinition,
	controller: controllerDefinition,
	controlled: controlledDefinition,
	attack: attackDefinition,
};

export type Components = ComponentsOf<typeof registry>;
export type Config = EntityConfigOf<typeof registry>;

// The concrete shared-memory block (typed array) each component stores its data in, derived straight from the
// definition's `type` constructor.  A system's update function declares the blocks it touches with
// `Pick<ComponentArrays, ...>` so it gets real element types (Float32Array / Int32Array / ...) instead of the
// generic ComponentTypedArray - no casts needed at the call sites.
export type ComponentArrays = {
	[K in keyof typeof registry]: InstanceType<(typeof registry)[K]['type']>
};
