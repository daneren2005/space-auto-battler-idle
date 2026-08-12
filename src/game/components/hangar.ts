import type { ComponentDefinition } from '@daneren2005/shared-memory-ecs';
import { SHIP_TYPES, SHIP_TYPE_INDEX, SHIP_TYPE_COUNT, type ShipType } from '@/data/ship-types';

// hangar: a station's per-ship-type production state - one production line per type, laid out by SHIP_TYPE_INDEX.
// Five values per type:
//
//   rate        - ships/second (0 = not built / locked). Read by the spawn worker, so mutated with Atomics.
//   level       - upgrade level (0 = locked, 1 = base). Scales spawned shields/damage. Atomic like rate.
//   progress    - fraction of the next ship banked. Written only by the spawn worker, so a plain read is safe.
//   rateBought  - rate upgrades bought (prices the next, cost = base * growth ** rateBought; rate = config + this).
//   levelBought - the same for level upgrades (level = config base + this).
//
// rateBought / levelBought are touched only by the main thread, so plain reads/writes are safe.
// No save(): spawn progress isn't worth persisting and bought counts ride the separate Carry record.
//
// Two trailing station-wide scalars carry the player's prestige multipliers (see ascendancy.ts): the main thread
// stamps them at load, the spawn worker reads them to scale this station's ships/second (Doctrine) and stamped
// damage (Munitions). Stored fixed-point (x1000, 1000 = no bonus); non-player stations keep the default.

// Five sections of SHIP_TYPE_COUNT: rates, levels, progress, rateBought, levelBought.
export function hangarRateIndex(typeIndex: number): number {
	return typeIndex;
}
export function hangarLevelIndex(typeIndex: number): number {
	return SHIP_TYPE_COUNT + typeIndex;
}
export function hangarProgressIndex(typeIndex: number): number {
	return 2 * SHIP_TYPE_COUNT + typeIndex;
}
export function hangarRateBoughtIndex(typeIndex: number): number {
	return 3 * SHIP_TYPE_COUNT + typeIndex;
}
export function hangarLevelBoughtIndex(typeIndex: number): number {
	return 4 * SHIP_TYPE_COUNT + typeIndex;
}

const HANGAR_SECTIONS = 5;

export const HANGAR_RATE_MULT = HANGAR_SECTIONS * SHIP_TYPE_COUNT;
export const HANGAR_DAMAGE_MULT = HANGAR_SECTIONS * SHIP_TYPE_COUNT + 1;
export const HANGAR_MULT_SCALE = 1000;
const HANGAR_SIZE = HANGAR_SECTIONS * SHIP_TYPE_COUNT + 2;

export interface HangarShipConfig {
	rate?: number
	level?: number
}
export interface HangarConfig {
	// A station is the one entity built with a `color`, so it gates the hangar on. Unused here - controller owns colour.
	color?: number
	// Which types this station builds, each at its own rate + level. No `ships` (or all rate 0) builds nothing.
	ships?: Partial<Record<ShipType, HangarShipConfig>>
}
export interface HangarComponent {
	index: number
	rate(typeIndex: number): number
	level(typeIndex: number): number
	rateBought(typeIndex: number): number
	levelBought(typeIndex: number): number
	rateMultiplier: number
	damageMultiplier: number
}

export const hangarDefinition: ComponentDefinition<HangarComponent, Int32Array, HangarConfig> = {
	type: Int32Array,
	size: HANGAR_SIZE,
	// Only a station carries a hangar, and a station is the one entity built with a `color`.
	loadProperties: ['color'],
	load(entity, memory, config) {
		const values = Array.from({ length: HANGAR_SIZE }, () => 0);
		values[HANGAR_RATE_MULT] = HANGAR_MULT_SCALE;
		values[HANGAR_DAMAGE_MULT] = HANGAR_MULT_SCALE;
		if(config.ships) {
			for(const type of SHIP_TYPES) {
				const ship = config.ships[type];
				if(ship) {
					const typeIndex = SHIP_TYPE_INDEX[type];
					values[hangarRateIndex(typeIndex)] = ship.rate ?? 0;
					// A built type defaults to level 1 (base).
					values[hangarLevelIndex(typeIndex)] = ship.level ?? (ship.rate ? 1 : 0);
				}
			}
		}

		const index = memory.create(values);
		const block = memory.getBlock(index);

		return {
			index,
			rate(typeIndex: number) {
				return block[hangarRateIndex(typeIndex)];
			},
			level(typeIndex: number) {
				return block[hangarLevelIndex(typeIndex)];
			},
			rateBought(typeIndex: number) {
				return block[hangarRateBoughtIndex(typeIndex)];
			},
			levelBought(typeIndex: number) {
				return block[hangarLevelBoughtIndex(typeIndex)];
			},
			get rateMultiplier() {
				return block[HANGAR_RATE_MULT] / HANGAR_MULT_SCALE;
			},
			set rateMultiplier(value: number) {
				block[HANGAR_RATE_MULT] = Math.round(value * HANGAR_MULT_SCALE);
			},
			get damageMultiplier() {
				return block[HANGAR_DAMAGE_MULT] / HANGAR_MULT_SCALE;
			},
			set damageMultiplier(value: number) {
				block[HANGAR_DAMAGE_MULT] = Math.round(value * HANGAR_MULT_SCALE);
			},
		};
	},
};
