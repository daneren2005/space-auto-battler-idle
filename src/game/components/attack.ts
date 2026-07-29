import type { ComponentDefinition } from '@daneren2005/shared-memory-ecs';

// attack: the eid a ship is currently steering toward (0 = none) plus how strongly it steers toward that
// target each tick.  `attacks` is a marker Config prop that a type template sets to opt an entity into
// targeting; steerForce is Config; target is the only runtime state and it is not worth persisting.
//
// steerForce is rolled once per ship, somewhere between the template's steerForce and steerForceBonus above
// it, rather than being copied straight off the template - so no two ships turn at quite the same radius.
// That roll is why it is stored per-entity.
//
// The roll only ever goes UP.  Speed is constant, so steerForce is what sets a ship's turn radius, and a ship
// can never reach anything inside its own turn circle: rolling a ship's steer force *down* widens that circle
// and makes it worse at closing, which measurably causes more of the circling this is meant to reduce, not
// less.  A one-sided roll keeps every ship distinct without ever making one worse than the template.

// Block layout (Float32Array, size 2).
export const ATTACK_TARGET = 0;
export const ATTACK_STEER_FORCE = 1;

export interface AttackComponent {
	index: number
	target: number
	steerForce: number
}
export interface AttackConfig {
	attacks: boolean
	steerForce: number
	steerForceBonus?: number
}
export const attackDefinition: ComponentDefinition<AttackComponent, Float32Array, AttackConfig> = {
	type: Float32Array,
	size: 2,
	loadProperties: ['attacks'],
	load(entity, memory, config) {
		const index = memory.create([0, rollSteerForce(config.steerForce, config.steerForceBonus)]);
		const block = memory.getBlock(index);

		return {
			index,
			get target() {
				return block[ATTACK_TARGET];
			},
			set target(value: number) {
				block[ATTACK_TARGET] = value;
			},
			get steerForce() {
				return block[ATTACK_STEER_FORCE];
			},
			set steerForce(value: number) {
				block[ATTACK_STEER_FORCE] = value;
			},
		};
	},
};

// A steer force somewhere in [steerForce, steerForce * (1 + bonus)] - so `bonus` of 0.5 turns a template
// steerForce of 10 into a roll over 10 to 15.  Defaults to none, so a ship type that wants every unit
// identical simply omits it.
function rollSteerForce(steerForce: number, bonus: number | undefined): number {
	if(!bonus) {
		return steerForce;
	}

	return steerForce * (1 + Math.random() * bonus);
}
