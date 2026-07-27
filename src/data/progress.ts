// Persistent meta-progress: which level the player is on and the upgrades / money they carry into it.  Levels
// are advanced by a page reload (see the win/lose dialog), so this small localStorage record is what survives
// the reload and lets earlier upgrades carry over.

export interface Carry {
	// How many of each upgrade type the player has bought across all levels so far.
	openShipUpgrades: number
	shieldUpgrades: number
	// Unspent kill-reward money.
	money: number
}
export interface Progress {
	levelIndex: number
	carry: Carry
}

const KEY = 'space-auto-battler-progress';

export function emptyCarry(): Carry {
	return { openShipUpgrades: 0, shieldUpgrades: 0, money: 0 };
}

export function loadProgress(): Progress {
	try {
		const raw = localStorage.getItem(KEY);
		if(raw) {
			const parsed = JSON.parse(raw) as Partial<Progress>;
			return {
				levelIndex: parsed.levelIndex ?? 0,
				carry: { ...emptyCarry(), ...parsed.carry },
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
