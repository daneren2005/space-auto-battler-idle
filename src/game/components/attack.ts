import type { ComponentDefinition } from '@daneren2005/shared-memory-ecs';

// attack: the eid a ship is currently steering toward (0 = none) plus how it flies while chasing it - how
// strongly it steers toward that target each tick, and the top speed it renormalises to afterwards.  `attacks`
// is a marker Config prop that a type template sets to opt an entity into targeting; steerForce and speed are
// Config; target is the only runtime state and it is not worth persisting.
//
// `speed` lives here rather than on the velocity component because that component comes from
// shared-memory-physics and holds only the live vector: the top speed a ship steers back to is this game's own
// idea, and moveToTargetUpdate - the only thing that reads it - already requires this component.
//
// steerForce is rolled once per ship, somewhere between the template's steerForce and steerForceBonus above
// it, rather than being copied straight off the template - so no two ships turn at quite the same radius.
// That roll is why it is stored per-entity.
//
// The roll only ever goes UP.  Speed is constant, so steerForce is what sets a ship's turn radius, and a ship
// can never reach anything inside its own turn circle: rolling a ship's steer force *down* widens that circle
// and makes it worse at closing, which measurably causes more of the circling this is meant to reduce, not
// less.  A one-sided roll keeps every ship distinct without ever making one worse than the template.

// Block layout (Float32Array, size 3).
export const ATTACK_TARGET = 0;
export const ATTACK_STEER_FORCE = 1;
export const ATTACK_SPEED = 2;

export interface AttackComponent {
	index: number
	target: number
	steerForce: number
	speed: number
}
export interface AttackConfig {
	attacks: boolean
	steerForce: number
	steerForceBonus?: number
	speed: number
}
export const attackDefinition: ComponentDefinition<AttackComponent, Float32Array, AttackConfig> = {
	type: Float32Array,
	size: 3,
	loadProperties: ['attacks'],
	load(entity, memory, config) {
		const index = memory.create([0, rollSteerForce(config.steerForce, config.steerForceBonus), config.speed]);
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
			get speed() {
				return block[ATTACK_SPEED];
			},
			set speed(value: number) {
				block[ATTACK_SPEED] = value;
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
