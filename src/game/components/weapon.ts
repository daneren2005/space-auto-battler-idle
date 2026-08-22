import { Component } from '@daneren2005/shared-memory-ecs';
import type { ComponentDefinition } from '@daneren2005/shared-memory-ecs';

// weapon: everything an armed ship needs to fire. Only armed types carry it (the weapon query requires it). All
// but `timeSinceFired` are static config; `timeSinceFired` is the cooldown clock, started at `fireInterval` so a
// ship can fire the instant it acquires a target.

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
	// Per-spawn override of per-shot damage, stamped by the spawn worker with the level-scaled value.
	weaponDamage?: number
	// Per-spawn override of the volley's shot/drone count, for a type whose count scales with level (the Carrier).
	weaponProjectileCount?: number
}
class WeaponComponentImpl extends Component<Float32Array> implements WeaponComponent {
	get range() {
		return this.block[WEAPON_RANGE];
	}
	set range(value: number) {
		this.block[WEAPON_RANGE] = value;
	}
	get fireInterval() {
		return this.block[WEAPON_FIRE_INTERVAL];
	}
	set fireInterval(value: number) {
		this.block[WEAPON_FIRE_INTERVAL] = value;
	}
	get projectileCount() {
		return this.block[WEAPON_PROJECTILE_COUNT];
	}
	set projectileCount(value: number) {
		this.block[WEAPON_PROJECTILE_COUNT] = value;
	}
	get spread() {
		return this.block[WEAPON_SPREAD];
	}
	set spread(value: number) {
		this.block[WEAPON_SPREAD] = value;
	}
	get projectileSpeed() {
		return this.block[WEAPON_PROJECTILE_SPEED];
	}
	set projectileSpeed(value: number) {
		this.block[WEAPON_PROJECTILE_SPEED] = value;
	}
	get damage() {
		return this.block[WEAPON_DAMAGE];
	}
	set damage(value: number) {
		this.block[WEAPON_DAMAGE] = value;
	}
	get homing() {
		return this.block[WEAPON_HOMING] === 1;
	}
	set homing(value: boolean) {
		this.block[WEAPON_HOMING] = value ? 1 : 0;
	}
	get homingTurn() {
		return this.block[WEAPON_HOMING_TURN];
	}
	set homingTurn(value: number) {
		this.block[WEAPON_HOMING_TURN] = value;
	}
	get spawnsDrones() {
		return this.block[WEAPON_SPAWNS_DRONES] === 1;
	}
	set spawnsDrones(value: boolean) {
		this.block[WEAPON_SPAWNS_DRONES] = value ? 1 : 0;
	}
	get timeSinceFired() {
		return this.block[WEAPON_TIME_SINCE_FIRED];
	}
	set timeSinceFired(value: number) {
		this.block[WEAPON_TIME_SINCE_FIRED] = value;
	}
}
export const weaponDefinition: ComponentDefinition<WeaponComponent, Float32Array, WeaponConfig> = {
	type: Float32Array,
	size: 10,
	loadProperties: ['weapon'],
	toBlock(config) {
		const weapon = config.weapon;
		return [
			weapon.range,
			weapon.fireInterval,
			// Spawn worker stamps the level-scaled count; a directly-placed ship uses the def's own.
			config.weaponProjectileCount ?? weapon.projectileCount ?? 1,
			weapon.spread ?? 0,
			weapon.projectileSpeed,
			// Spawn worker stamps the level-scaled per-shot damage; a directly-placed ship uses the def's own.
			config.weaponDamage ?? weapon.damage,
			weapon.homing ? 1 : 0,
			weapon.homingTurn ?? DEFAULT_HOMING_TURN,
			weapon.spawnsDrones ? 1 : 0,
			// Ready to fire the moment it first sees a target.
			weapon.fireInterval,
		];
	},
	attach(entity, memory, index) {
		return new WeaponComponentImpl(memory.getBlock(index), index);
	},
};
