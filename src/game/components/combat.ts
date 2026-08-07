import type { ComponentDefinition } from '@daneren2005/shared-memory-ecs';

// combat: contact damage, whether contact detonates, and the kill reward. A `blastRadius` above zero turns a ram
// into a detonation (the Detonator). `bounty` is held here so collision code can price a kill off the dead
// entity's block without knowing its type. All three are static per ship, so no save().

// Block layout (Float32Array, size 3).
export const COMBAT_CONTACT_DAMAGE = 0;
export const COMBAT_BLAST_RADIUS = 1;
export const COMBAT_BOUNTY = 2;

// Fired on a detonator's entity when its blast goes off, carrying (x, y, blastRadius). Emitted before the kill,
// so the entity is still alive when the event reaches the main thread.
export const DETONATED_EVENT = 'detonated';

// Kill reward when none is spelled out (a drone, a projectile).
const DEFAULT_BOUNTY = 1;

export interface CombatComponent {
	index: number
	contactDamage: number
	blastRadius: number
	bounty: number
}
export interface CombatConfig {
	contactDamage: number
	blastRadius?: number
	bounty?: number
}
export const combatDefinition: ComponentDefinition<CombatComponent, Float32Array, CombatConfig> = {
	type: Float32Array,
	size: 3,
	loadProperties: ['contactDamage'],
	load(entity, memory, config) {
		const index = memory.create([config.contactDamage, config.blastRadius ?? 0, config.bounty ?? DEFAULT_BOUNTY]);
		const block = memory.getBlock(index);

		return {
			index,
			get contactDamage() {
				return block[COMBAT_CONTACT_DAMAGE];
			},
			set contactDamage(value: number) {
				block[COMBAT_CONTACT_DAMAGE] = value;
			},
			get blastRadius() {
				return block[COMBAT_BLAST_RADIUS];
			},
			set blastRadius(value: number) {
				block[COMBAT_BLAST_RADIUS] = value;
			},
			get bounty() {
				return block[COMBAT_BOUNTY];
			},
			set bounty(value: number) {
				block[COMBAT_BOUNTY] = value;
			},
		};
	},
};
