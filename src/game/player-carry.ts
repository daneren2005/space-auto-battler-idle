import type { BaseEntity } from '@daneren2005/shared-memory-ecs';
import type { Carry } from '@/data/progress';
import { SHIP_TYPES, SHIP_TYPE_INDEX } from '@/data/ship-types';
import type { Components } from './components';

// Reads the carry a station is holding right now: its faction's unspent money, and per type the rate / level
// upgrades that have been bought (the hangar's bought counters, which rebuild the whole line when re-applied on
// the next load - see progress.ts / game-scene create()).  Only types with something bought are stored, so the
// carry stays small and a locked type is simply absent.
//
// This takes the station entity directly rather than looking it up by eid because the one moment it matters most -
// the player station being destroyed on a loss - the world has already removed the station from its map by the
// time we can react, yet the entity object (and its component memory) is still live for the length of the
// `entity-removed` event.  Passing the entity through lets the scene snapshot the carry there, so a defeat saves
// what the player died holding instead of zeros read off a station that is already gone.
export function carryFromStation(station: BaseEntity<Components>): Carry {
	const hangar = station.components.hangar;
	const carry: Carry = { money: station.components.controller?.money ?? 0, ships: {} };
	if(hangar) {
		for(const type of SHIP_TYPES) {
			const idx = SHIP_TYPE_INDEX[type];
			const rate = hangar.rateBought(idx);
			const level = hangar.levelBought(idx);
			if(rate > 0 || level > 0) {
				carry.ships[type] = { rate, level };
			}
		}
	}
	return carry;
}
