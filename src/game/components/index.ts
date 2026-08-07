import type { ComponentsOf, EntityConfigOf } from '@daneren2005/shared-memory-ecs';
import { physicsRegistry } from '@daneren2005/shared-memory-physics';
import { healthDefinition } from './health';
import { controllerDefinition } from './controller';
import { hangarDefinition } from './hangar';
import { controlledDefinition } from './controlled';
import { attackDefinition } from './attack';
import { combatDefinition } from './combat';
import { weaponDefinition } from './weapon';
import { projectileDefinition } from './projectile';

// One place declares every component; the world derives its typed component map + flat entity config from it.
// `transform` / `velocity` / `body` come from shared-memory-physics, so this game only declares its own.
export const registry = {
	...physicsRegistry,
	health: healthDefinition,
	controller: controllerDefinition,
	hangar: hangarDefinition,
	controlled: controlledDefinition,
	attack: attackDefinition,
	combat: combatDefinition,
	weapon: weaponDefinition,
	projectile: projectileDefinition,
};

export type Components = ComponentsOf<typeof registry>;
export type Config = EntityConfigOf<typeof registry>;

// The concrete typed array each component stores its data in. A system Picks the blocks it touches to get real
// element types (Float32Array / ...) instead of the generic ComponentTypedArray - no casts at the call sites.
export type ComponentArrays = {
	[K in keyof typeof registry]: InstanceType<(typeof registry)[K]['type']>
};
