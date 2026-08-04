import type { ComponentDefinition } from '@daneren2005/shared-memory-ecs';

// combat: how much damage an entity deals on contact, and whether that contact detonates.  `contactDamage` is
// what a ship removes from whatever it rams (see physics-update's exchangeDamage); a `blastRadius` above zero
// turns a ram into a detonation - the ship explodes, dealing its contact damage to every enemy within the radius
// and dying, instead of trading a single hit (the Detonator).  Both are static per ship - they come from the
// ship type + its level at spawn - so like `attack` this definition has nothing runtime worth persisting and has
// no save().

// Block layout (Float32Array, size 2).
export const COMBAT_CONTACT_DAMAGE = 0;
export const COMBAT_BLAST_RADIUS = 1;

export interface CombatComponent {
	index: number
	contactDamage: number
	blastRadius: number
}
export interface CombatConfig {
	contactDamage: number
	blastRadius?: number
}
export const combatDefinition: ComponentDefinition<CombatComponent, Float32Array, CombatConfig> = {
	type: Float32Array,
	size: 2,
	loadProperties: ['contactDamage'],
	load(entity, memory, config) {
		const index = memory.create([config.contactDamage, config.blastRadius ?? 0]);
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
		};
	},
};
