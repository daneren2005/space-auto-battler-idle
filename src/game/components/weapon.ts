import type { ComponentDefinition } from '@daneren2005/shared-memory-ecs';

// weapon: everything a ship needs to fire projectiles at its target.  Only armed ship types carry it (the
// weapon system's query requires it, so a rammer like the Skiff simply never fires).  A weapon is described by
// one nested `weapon` object on the entity config rather than a spray of flat fields, so a ship type reads as a
// single block of intent (see the ship roster in plans/03-ship-roster.md).
//
// All but `timeSinceFired` are static config: `range` (how close a target must be to fire), `fireInterval`
// (seconds between volleys), `projectileCount` + `spread` (how many shots per volley and the total angular fan
// they leave in), `projectileSpeed`, `damage` per shot, `homing` (whether the shots steer) with `homingTurn` as
// their steer force, and `spawnsDrones` (whether a volley launches drone sub-ships instead of projectiles - the
// Carrier).  `timeSinceFired` is the runtime cooldown clock, advanced by the weapon update; it starts at
// `fireInterval` so a ship can fire the instant it acquires a target rather than after a full cooldown.

// Block layout (Float32Array, size 10).
export const WEAPON_RANGE = 0;
export const WEAPON_FIRE_INTERVAL = 1;
export const WEAPON_PROJECTILE_COUNT = 2;
export const WEAPON_SPREAD = 3;
export const WEAPON_PROJECTILE_SPEED = 4;
export const WEAPON_DAMAGE = 5;
export const WEAPON_HOMING = 6;
export const WEAPON_HOMING_TURN = 7;
export const WEAPON_SPAWNS_DRONES = 8;
export const WEAPON_TIME_SINCE_FIRED = 9;

// The default steer force a homing shot turns at when a weapon does not name its own.
const DEFAULT_HOMING_TURN = 30;

export interface WeaponSettings {
	range: number
	fireInterval: number
	projectileCount?: number
	spread?: number
	projectileSpeed: number
	damage: number
	homing?: boolean
	homingTurn?: number
	spawnsDrones?: boolean
}
export interface WeaponComponent {
	index: number
	range: number
	fireInterval: number
	projectileCount: number
	spread: number
	projectileSpeed: number
	damage: number
	homing: boolean
	homingTurn: number
	spawnsDrones: boolean
	timeSinceFired: number
}
export interface WeaponConfig {
	weapon: WeaponSettings
	// A per-spawn override of the weapon's per-shot damage, so the spawn worker can stamp the level-scaled value
	// without rewriting the whole nested `weapon` object.  Falls back to the weapon's own `damage` when absent.
	weaponDamage?: number
}
export const weaponDefinition: ComponentDefinition<WeaponComponent, Float32Array, WeaponConfig> = {
	type: Float32Array,
	size: 10,
	loadProperties: ['weapon'],
	load(entity, memory, config) {
		const weapon = config.weapon;
		const index = memory.create([
			weapon.range,
			weapon.fireInterval,
			weapon.projectileCount ?? 1,
			weapon.spread ?? 0,
			weapon.projectileSpeed,
			// The spawn worker stamps the level-scaled per-shot damage here; a directly-placed ship uses the def's own.
			config.weaponDamage ?? weapon.damage,
			weapon.homing ? 1 : 0,
			weapon.homingTurn ?? DEFAULT_HOMING_TURN,
			weapon.spawnsDrones ? 1 : 0,
			// Ready to fire the moment it first sees a target.
			weapon.fireInterval,
		]);
		const block = memory.getBlock(index);

		return {
			index,
			get range() {
				return block[WEAPON_RANGE];
			},
			set range(value: number) {
				block[WEAPON_RANGE] = value;
			},
			get fireInterval() {
				return block[WEAPON_FIRE_INTERVAL];
			},
			set fireInterval(value: number) {
				block[WEAPON_FIRE_INTERVAL] = value;
			},
			get projectileCount() {
				return block[WEAPON_PROJECTILE_COUNT];
			},
			set projectileCount(value: number) {
				block[WEAPON_PROJECTILE_COUNT] = value;
			},
			get spread() {
				return block[WEAPON_SPREAD];
			},
			set spread(value: number) {
				block[WEAPON_SPREAD] = value;
			},
			get projectileSpeed() {
				return block[WEAPON_PROJECTILE_SPEED];
			},
			set projectileSpeed(value: number) {
				block[WEAPON_PROJECTILE_SPEED] = value;
			},
			get damage() {
				return block[WEAPON_DAMAGE];
			},
			set damage(value: number) {
				block[WEAPON_DAMAGE] = value;
			},
			get homing() {
				return block[WEAPON_HOMING] === 1;
			},
			set homing(value: boolean) {
				block[WEAPON_HOMING] = value ? 1 : 0;
			},
			get homingTurn() {
				return block[WEAPON_HOMING_TURN];
			},
			set homingTurn(value: number) {
				block[WEAPON_HOMING_TURN] = value;
			},
			get spawnsDrones() {
				return block[WEAPON_SPAWNS_DRONES] === 1;
			},
			set spawnsDrones(value: boolean) {
				block[WEAPON_SPAWNS_DRONES] = value ? 1 : 0;
			},
			get timeSinceFired() {
				return block[WEAPON_TIME_SINCE_FIRED];
			},
			set timeSinceFired(value: number) {
				block[WEAPON_TIME_SINCE_FIRED] = value;
			},
		};
	},
};
