// Persistent meta-progress: which level the player is on and the upgrades / money carried into it. Written to
// localStorage on every jump so reopening the tab resumes at the right level with the earned upgrades.

import { SHIP_TYPES, type ShipType } from '@/data/ship-types';
import { standingFleetTypes, type AscendancyNodes } from '@/data/ascendancy';

// Bought upgrades for one ship type, as counts on top of the level's station seed. For a type the level doesn't
// build, these rebuild the whole line: `rate`/`level` of 1 re-unlocks it back to its base state.
export interface CarryShip {
	rate: number
	level: number
}
export interface Carry {
	money: number
	// Per-type bought upgrades; only types the player put money into are stored.
	ships: Partial<Record<ShipType, CarryShip>>
}
export interface Progress {
	levelIndex: number
	// Highest level the run has ever reached (peak, not current - a loss drops levelIndex but not this). Prestige
	// banks Dark Matter off it, and reaching a threshold here is what first unlocks the Singularity.
	highestLevelIndex: number
	carry: Carry
}

// The pre-roster save shape (single Skiff line). Kept only so loadProgress can migrate it into Carry.
interface LegacyCarry {
	shipRateUpgrades?: number
	shieldUpgrades?: number
	money?: number
}

const KEY = 'space-auto-battler-progress';

export function emptyCarry(): Carry {
	return { money: 0, ships: {} };
}

// The Carry a fresh run begins with once prestige bonuses apply: Standing Fleet pre-unlocks its cheapest types.
// With no Ascendancy nodes this is exactly emptyCarry, so a brand-new player is unaffected. Applied on top of the
// level's PLAYER_START_SHIPS base the same way carried upgrades are. (Salvage/Doctrine/Munitions aren't carry -
// they're live multipliers stamped on the player's controller/hangar blocks at load; see game-scene.)
export function startingCarry(nodes: AscendancyNodes): Carry {
	const carry: Carry = { money: 0, ships: {} };
	for(const type of standingFleetTypes(nodes)) {
		carry.ships[type] = { rate: 1, level: 1 };
	}
	return carry;
}

// Coerce whatever was in storage into a well-formed Carry, migrating the pre-roster shape onto the Skiff line.
function normalizeCarry(raw: unknown): Carry {
	if(!raw || typeof raw !== 'object') {
		return emptyCarry();
	}
	const record = raw as Partial<Carry> & LegacyCarry;
	const carry: Carry = { money: record.money ?? 0, ships: {} };

	if(record.ships && typeof record.ships === 'object') {
		for(const type of SHIP_TYPES) {
			const ship = record.ships[type];
			if(ship) {
				carry.ships[type] = { rate: ship.rate ?? 0, level: ship.level ?? 0 };
			}
		}
	} else if(record.shipRateUpgrades !== undefined || record.shieldUpgrades !== undefined) {
		// Legacy: the only line was the Skiff's, so its upgrades carry onto it.
		carry.ships.skiff = { rate: record.shipRateUpgrades ?? 0, level: record.shieldUpgrades ?? 0 };
	}

	return carry;
}

export function loadProgress(): Progress {
	try {
		const raw = localStorage.getItem(KEY);
		if(raw) {
			const parsed = JSON.parse(raw) as Partial<Progress>;
			const levelIndex = parsed.levelIndex ?? 0;
			return {
				levelIndex,
				// Pre-prestige saves have no peak recorded, so seed it from where they currently are.
				highestLevelIndex: Math.max(parsed.highestLevelIndex ?? 0, levelIndex),
				carry: normalizeCarry(parsed.carry),
			};
		}
	} catch{
		// Corrupt / unavailable storage: fall back to a fresh start.
	}
	return { levelIndex: 0, highestLevelIndex: 0, carry: emptyCarry() };
}

export function saveProgress(progress: Progress): void {
	try {
		localStorage.setItem(KEY, JSON.stringify(progress));
	} catch{
		// Storage unavailable (private mode, etc.): progression just won't persist.
	}
}

export function resetProgress(): void {
	try {
		localStorage.removeItem(KEY);
	} catch{
		// Nothing to do if storage is unavailable.
	}
}

export type MatchOutcome = 'won' | 'lost';

// A win advances (or resets once the last level is cleared); a loss drops back a level (never below the first),
// so an idle run keeps banking money on a level it can clear until it can push at the wall again. Either way the
// money and upgrades carry forward. `'reset'` means wipe the save back to a fresh run.
export function progressAfterMatch(
	outcome: MatchOutcome,
	levelIndex: number,
	nextLevelIndex: number,
	carry: Carry,
	highestLevelIndex: number,
): Progress | 'reset' {
	if(outcome === 'won') {
		if(nextLevelIndex < 0) {
			return 'reset';
		}
		return { levelIndex: nextLevelIndex, highestLevelIndex: Math.max(highestLevelIndex, nextLevelIndex), carry };
	}
	// Level 0 has nowhere further back, so a loss there replays it. A loss never lowers the recorded peak.
	return { levelIndex: Math.max(0, levelIndex - 1), highestLevelIndex, carry };
}
