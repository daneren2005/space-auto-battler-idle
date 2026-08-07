import type { ComponentDefinition } from '@daneren2005/shared-memory-ecs';

// attack: the eid a ship steers toward (0 = none) plus how it flies while chasing - steer force and top speed.
// `speed` lives here, not on the physics velocity component, since the top speed a ship steers back to is this
// game's own idea and moveToTargetUpdate (its only reader) already requires this component.
//
// steerForce is rolled once per ship so no two turn at the same radius. The roll only ever goes UP: a lower
// steer force widens the turn circle and makes a ship worse at closing, causing more circling, not less.

// How far past its hull a ship looks for an enemy by default. Long-range types set a bigger `searchRange`.
export const DEFAULT_SEARCH_RANGE = 150;

// Seconds a strafing ship slides one way before reversing (the Missile Frigate). Read by move-to-target.
export const STRAFE_LEG_SECONDS = 1.4;

// Block layout (Float32Array, size 7).
export const ATTACK_TARGET = 0;
export const ATTACK_STEER_FORCE = 1;
export const ATTACK_SPEED = 2;
export const ATTACK_SEARCH_RANGE = 3;
// The range an armed ship holds at to fire (its weapon range); 0 for a rammer, which keeps closing.
export const ATTACK_STANDOFF_RANGE = 4;
export const ATTACK_STRAFE = 5;
// Runtime strafe state: sign is the current lateral direction, magnitude is seconds on this leg.
export const ATTACK_STRAFE_TIMER = 6;

export interface AttackComponent {
	index: number
	target: number
	steerForce: number
	speed: number
	searchRange: number
	standoffRange: number
	strafe: boolean
	strafeTimer: number
}
export interface AttackConfig {
	attacks: boolean
	steerForce: number
	steerForceBonus?: number
	speed: number
	searchRange?: number
	// The range an armed ship holds at; omitted (0) for a rammer, which closes all the way.
	standoffRange?: number
	// Strafe across the target instead of holding still once in range (the Missile Frigate).
	strafe?: boolean
}
export const attackDefinition: ComponentDefinition<AttackComponent, Float32Array, AttackConfig> = {
	type: Float32Array,
	size: 7,
	loadProperties: ['attacks'],
	load(entity, memory, config) {
		const strafe = config.strafe ? 1 : 0;
		const index = memory.create([
			0,
			rollSteerForce(config.steerForce, config.steerForceBonus),
			config.speed,
			config.searchRange ?? DEFAULT_SEARCH_RANGE,
			config.standoffRange ?? 0,
			strafe,
			// Seed a random side + leg offset so a batch of strafers weaves out of phase, not in lockstep.
			strafe ? (Math.random() < 0.5 ? -1 : 1) * Math.random() * STRAFE_LEG_SECONDS : 0,
		]);
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
			get searchRange() {
				return block[ATTACK_SEARCH_RANGE];
			},
			set searchRange(value: number) {
				block[ATTACK_SEARCH_RANGE] = value;
			},
			get standoffRange() {
				return block[ATTACK_STANDOFF_RANGE];
			},
			set standoffRange(value: number) {
				block[ATTACK_STANDOFF_RANGE] = value;
			},
			get strafe() {
				return block[ATTACK_STRAFE] === 1;
			},
			set strafe(value: boolean) {
				block[ATTACK_STRAFE] = value ? 1 : 0;
			},
			get strafeTimer() {
				return block[ATTACK_STRAFE_TIMER];
			},
			set strafeTimer(value: number) {
				block[ATTACK_STRAFE_TIMER] = value;
			},
		};
	},
};

// A roll in [steerForce, steerForce * (1 + bonus)]. Omitting `bonus` makes every unit identical.
function rollSteerForce(steerForce: number, bonus: number | undefined): number {
	if(!bonus) {
		return steerForce;
	}

	return steerForce * (1 + Math.random() * bonus);
}
