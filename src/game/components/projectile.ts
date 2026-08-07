import type { ComponentDefinition } from '@daneren2005/shared-memory-ecs';

// projectile: marks a fired shot. These are sensor bodies that deal their combat `contactDamage` to the first
// enemy they overlap, then are consumed. `remainingLifetime` (seconds) is counted down by update-projectiles.
// `target` + `turn` steer a homing shot; a straight shot leaves both at 0. This block's presence is what tells
// the collision code an entity is a projectile.

// Block layout (Float32Array, size 3).
export const PROJECTILE_REMAINING_LIFETIME = 0;
export const PROJECTILE_TARGET = 1;
export const PROJECTILE_TURN = 2;

export interface ProjectileComponent {
	index: number
	remainingLifetime: number
	target: number
	turn: number
}
export interface ProjectileConfig {
	remainingLifetime: number
	// Homing shots set these at launch; a straight shot omits them (both default to 0).
	target?: number
	turn?: number
}
export const projectileDefinition: ComponentDefinition<ProjectileComponent, Float32Array, ProjectileConfig> = {
	type: Float32Array,
	size: 3,
	loadProperties: ['remainingLifetime'],
	load(entity, memory, config) {
		const index = memory.create([config.remainingLifetime, config.target ?? 0, config.turn ?? 0]);
		const block = memory.getBlock(index);

		return {
			index,
			get remainingLifetime() {
				return block[PROJECTILE_REMAINING_LIFETIME];
			},
			set remainingLifetime(value: number) {
				block[PROJECTILE_REMAINING_LIFETIME] = value;
			},
			get target() {
				return block[PROJECTILE_TARGET];
			},
			set target(value: number) {
				block[PROJECTILE_TARGET] = value;
			},
			get turn() {
				return block[PROJECTILE_TURN];
			},
			set turn(value: number) {
				block[PROJECTILE_TURN] = value;
			},
		};
	},
};
