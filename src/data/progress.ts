// Persistent meta-progress: which level the player is on and the upgrades / money they carry into it.  Levels
// are advanced by a page reload (see the win/lose dialog), so this small localStorage record is what survives
// the reload and lets earlier upgrades carry over.

import { SHIP_TYPES, type ShipType } from '@/data/ship-types';

// The upgrades the player has bought for one ship type, as counts on top of whatever the level's station config
// seeds that type with.  For a type the level does not build at all (one the player unlocked themselves) these
// reconstruct the whole line: unlocking a type is its first rate + level purchase, so `rate`/`level` of 1 here
// re-build it back to its base unlocked state on the next level (see the hangar / ShipRoster).
export interface CarryShip {
	rate: number
	level: number
}
export interface Carry {
	// Unspent kill-reward money.
	money: number
	// Per-type bought upgrades, keyed by ship type.  A type absent from the map has been left at its level base
	// (or is still locked); only types the player actually put money into are stored.
	ships: Partial<Record<ShipType, CarryShip>>
}
export interface Progress {
	levelIndex: number
	carry: Carry
}

// The shape saved before the roster (a single Skiff production line): three scalars.  Kept only so loadProgress
// can migrate an existing player's save into the per-type Carry above without wiping their progress.
interface LegacyCarry {
	shipRateUpgrades?: number
	shieldUpgrades?: number
	money?: number
}

const KEY = 'space-auto-battler-progress';

export function emptyCarry(): Carry {
	return { money: 0, ships: {} };
}

// Coerce whatever was in storage into a well-formed Carry: a current per-type record is taken as-is (with missing
// pieces backfilled), and the pre-roster three-scalar shape is migrated so its rate / shield upgrades become the
// Skiff line's bought rate / level - the one type that existed before the roster.
function normalizeCarry(raw: unknown): Carry {
	if(!raw || typeof raw !== 'object') {
		return emptyCarry();
	}
	const record = raw as Partial<Carry> & LegacyCarry;
	const carry: Carry = { money: record.money ?? 0, ships: {} };

	if(record.ships && typeof record.ships === 'object') {
		// Current shape: copy each type's bought counts through, backfilling either half if it is missing.
		for(const type of SHIP_TYPES) {
			const ship = record.ships[type];
			if(ship) {
				carry.ships[type] = { rate: ship.rate ?? 0, level: ship.level ?? 0 };
			}
		}
	} else if(record.shipRateUpgrades !== undefined || record.shieldUpgrades !== undefined) {
		// Legacy shape: the only line that existed was the Skiff's, so its rate / shield upgrades carry onto it.
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
