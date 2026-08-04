import type { ComponentDefinition } from '@daneren2005/shared-memory-ecs';
import { SHIP_TYPES, SHIP_TYPE_INDEX, SHIP_TYPE_COUNT, type ShipType } from '@/data/ship-types';

// hangar: a station's per-ship-type production state.  Where the controller holds the faction (colour, money,
// player flag), the hangar holds what it is building - one independent production line per ship type, laid out
// by SHIP_TYPE_INDEX so a fixed-size block can address any type by its stable index.  Five values per type:
//
//   rate        - ships/second of this type (0 = the type is not built / locked).  Raised by the main thread when
//                 the player buys a rate upgrade, so the spawn worker reads it atomically.
//   level       - the upgrade level of this type (0 = locked, 1 = base).  It scales the shields and damage every
//                 ship of the type spawns with (see ship-types' shieldsForLevel / contactDamageForLevel).
//   progress    - the fraction of the next ship of this type banked so far, carried between runs (microseconds of
//                 elapsed time x rate).  Written only by the spawn worker, on one thread, so a plain read is safe.
//   rateBought  - how many rate upgrades the player has bought for this type (0 for a station's level-config base).
//                 It both prices the next rate upgrade (cost = base * growth ** rateBought) and is what carries
//                 across levels; the rate itself is the config base plus this, so the two move together on a buy.
//   levelBought - the same for level upgrades: how many the player has bought (level = config base + this).
//
// rateBought / levelBought are touched only by the main thread (the upgrade buttons), so plain reads/writes are
// safe for them; rate / level are read by the spawn worker, so those two are mutated with Atomics on a purchase.
//
// A station's spawn state is not worth persisting through world serialization (progress is at most a fraction of
// one ship, and the player's bought counts are carried by the separate Carry record), so this has no save().

// The block is five sections of SHIP_TYPE_COUNT each: all rates, then all levels, progress, rateBought, and
// finally all levelBought values.
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

// How many sections of SHIP_TYPE_COUNT the block holds, so the size and every allocation stay in step.
const HANGAR_SECTIONS = 5;

export interface HangarShipConfig {
	rate?: number
	level?: number
}
export interface HangarConfig {
	// A station is the one entity built with a `color` (see controller), so it is what gates the hangar on: every
	// station gets one, no ship or projectile does.  The value itself is unused here - the controller owns colour.
	color?: number
	// Which types this station builds, each at its own rate + level.  The only way to configure a station's
	// production: a station with no `ships` (or every line at rate 0) builds nothing.
	ships?: Partial<Record<ShipType, HangarShipConfig>>
}
export interface HangarComponent {
	index: number
	rate(typeIndex: number): number
	level(typeIndex: number): number
	rateBought(typeIndex: number): number
	levelBought(typeIndex: number): number
}

export const hangarDefinition: ComponentDefinition<HangarComponent, Int32Array, HangarConfig> = {
	type: Int32Array,
	size: HANGAR_SECTIONS * SHIP_TYPE_COUNT,
	// Only a station carries a hangar, and a station is the one entity built with a `color` (see controller).
	loadProperties: ['color'],
	load(entity, memory, config) {
		const values = Array.from({ length: HANGAR_SECTIONS * SHIP_TYPE_COUNT }, () => 0);
		if(config.ships) {
			for(const type of SHIP_TYPES) {
				const ship = config.ships[type];
				if(ship) {
					const typeIndex = SHIP_TYPE_INDEX[type];
					values[hangarRateIndex(typeIndex)] = ship.rate ?? 0;
					// A built type defaults to level 1 (base) if no explicit level is given.
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
		};
	},
};
