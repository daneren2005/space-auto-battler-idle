// Persistent meta-progress: which level the player is on and the upgrades / money carried into it. Written to
// localStorage on every jump so reopening the tab resumes at the right level with the earned upgrades.

import { SHIP_TYPES, type ShipType } from '@/data/ship-types';

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
			return {
				levelIndex: parsed.levelIndex ?? 0,
				carry: normalizeCarry(parsed.carry),
			};
		}
	} catch{
		// Corrupt / unavailable storage: fall back to a fresh start.
	}
	return { levelIndex: 0, carry: emptyCarry() };
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
): Progress | 'reset' {
	if(outcome === 'won') {
		return nextLevelIndex >= 0 ? { levelIndex: nextLevelIndex, carry } : 'reset';
	}
	// Level 0 has nowhere further back, so a loss there replays it.
	return { levelIndex: Math.max(0, levelIndex - 1), carry };
}
