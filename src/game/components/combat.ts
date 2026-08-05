import type { ComponentDefinition } from '@daneren2005/shared-memory-ecs';

// combat: how much damage an entity deals on contact, whether that contact detonates, and what killing it is
// worth.  `contactDamage` is what a ship removes from whatever it rams (see physics-update's exchangeDamage); a
// `blastRadius` above zero turns a ram into a detonation - the ship explodes, dealing its contact damage to every
// enemy within the radius and dying, instead of trading a single hit (the Detonator).  `bounty` is the kill
// reward paid to whoever destroys this entity - held here rather than on the def so the collision code can price
// a kill straight off the dead entity's block without knowing its ship type.  All three are static per ship -
// they come from the ship type (and, for damage, its level) at spawn - so like `attack` this definition has
// nothing runtime worth persisting and has no save().

// Block layout (Float32Array, size 3).
export const COMBAT_CONTACT_DAMAGE = 0;
export const COMBAT_BLAST_RADIUS = 1;
export const COMBAT_BOUNTY = 2;

// Fired on a detonator's entity the moment its blast goes off, carrying (x, y, blastRadius) so the render side
// can throw an explosion over the AoE (see physics-update's detonate + game-scene's spawnExplosion).  Emitted
// from the worker before the ship is killed, so the entity is still alive when the event reaches the main thread.
export const DETONATED_EVENT = 'detonated';

// The kill reward a combat entity is worth when none is spelled out (a drone, a projectile) - the flat one every
// ship used to be worth, so anything without a per-type bounty keeps that old value.
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
