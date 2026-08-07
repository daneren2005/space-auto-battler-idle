import type { BaseEntity } from '@daneren2005/shared-memory-ecs';
import type { Carry } from '@/data/progress';
import { SHIP_TYPES, SHIP_TYPE_INDEX } from '@/data/ship-types';
import type { Components } from './components';

// Reads the carry a station holds now: unspent money + per-type bought rate/level counters. Only types with
// something bought are stored. Takes the entity directly (not an eid lookup) so it works during the
// `entity-removed` event, when the station is off the world's map but its memory is still live - letting a loss
// snapshot what the player died holding instead of zeros.
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
