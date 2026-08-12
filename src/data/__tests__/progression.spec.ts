import { describe, it, expect, beforeEach } from 'vitest';
import { loadProgress, saveProgress, resetProgress, emptyCarry, progressAfterMatch } from '../progress';
import type { Carry } from '../progress';
import { levels, firstLevel, getLevel, getLevelIndex } from '../levels';
import { PLAYER_START_SHIPS } from '../levels/player-start';

// The progress module reads/writes localStorage, which the node test environment lacks - stub a minimal one.
class MemoryStorage {
	private store: Record<string, string> = {};
	getItem(key: string): string | null {
		return this.store[key] ?? null;
	}
	setItem(key: string, value: string): void {
		this.store[key] = value;
	}
	removeItem(key: string): void {
		delete this.store[key];
	}
}

describe('progress', () => {
	beforeEach(() => {
		(globalThis as unknown as { localStorage: MemoryStorage }).localStorage = new MemoryStorage();
	});

	it('defaults to level 0 with an empty carry when nothing is saved', () => {
		expect(loadProgress()).toEqual({ levelIndex: 0, highestLevelIndex: 0, carry: emptyCarry() });
	});

	it('round-trips a saved per-type carry', () => {
		const progress = {
			levelIndex: 1,
			highestLevelIndex: 4,
			carry: { money: 7, ships: { skiff: { rate: 3, level: 2 }, gunner: { rate: 1, level: 1 } } },
		};
		saveProgress(progress);
		expect(loadProgress()).toEqual(progress);
	});

	it('backfills a partial per-type entry to whole rate/level counts', () => {
		saveProgress({ levelIndex: 1, carry: { ships: { skiff: { rate: 4 } } } as never } as never);
		expect(loadProgress()).toEqual({
			levelIndex: 1,
			// No peak saved, so it seeds from the current level.
			highestLevelIndex: 1,
			carry: { money: 0, ships: { skiff: { rate: 4, level: 0 } } },
		});
	});

	it('migrates a pre-roster three-scalar carry onto the Skiff line', () => {
		// The shape saved before the roster: rate / shield upgrade counts + money, with no per-type map at all.
		saveProgress({ levelIndex: 2, carry: { shipRateUpgrades: 5, shieldUpgrades: 3, money: 9 } } as never);
		expect(loadProgress()).toEqual({
			levelIndex: 2,
			highestLevelIndex: 2,
			carry: { money: 9, ships: { skiff: { rate: 5, level: 3 } } },
		});
	});

	it('reset clears back to the default', () => {
		saveProgress({ levelIndex: 2, highestLevelIndex: 2, carry: emptyCarry() });
		resetProgress();
		expect(loadProgress().levelIndex).toBe(0);
	});
});

describe('progressAfterMatch', () => {
	const carry: Carry = { money: 40, ships: { skiff: { rate: 3, level: 2 } } };

	it('advances a win to the next level carrying the earned upgrades and money forward', () => {
		expect(progressAfterMatch('won', 1, 2, carry, 1)).toEqual({ levelIndex: 2, highestLevelIndex: 2, carry });
	});

	it('raises the recorded peak when a win pushes past it', () => {
		// Advancing to level 6 (index 5) from a run whose peak was index 4 lifts the peak to 5.
		expect(progressAfterMatch('won', 4, 5, carry, 4)).toEqual({ levelIndex: 5, highestLevelIndex: 5, carry });
	});

	it('resets the run when the last level is won (no next level)', () => {
		expect(progressAfterMatch('won', 5, -1, carry, 5)).toBe('reset');
	});

	it('drops back a level on a loss, keeping the money and upgrades - and the peak - the player died with', () => {
		// A loss falls back to the previous level (index 3 -> 2) carrying forward the money / upgrades the player
		// ended the failed attempt with - so an idle run keeps banking money on a level it can still clear rather
		// than stalling on the wall, and each attempt resumes stronger. The recorded peak never drops.
		expect(progressAfterMatch('lost', 3, 4, carry, 4)).toEqual({ levelIndex: 2, highestLevelIndex: 4, carry });
	});

	it('falls back regardless of whether this level has a next one', () => {
		// The next-level index is irrelevant to a loss; it always steps one level back.
		expect(progressAfterMatch('lost', 5, -1, carry, 5)).toEqual({ levelIndex: 4, highestLevelIndex: 5, carry });
	});

	it('holds on the first level when a loss has nowhere further back to go', () => {
		expect(progressAfterMatch('lost', 0, 1, carry, 0)).toEqual({ levelIndex: 0, highestLevelIndex: 0, carry });
	});
});

describe('levels', () => {
	it('chains level 1 into level 2', () => {
		expect(firstLevel.name).toBe('level-1');
		expect(firstLevel.nextLevel).toBe('level-2');
		expect(getLevel('level-2')).toBeDefined();
		expect(getLevelIndex('level-2')).toBe(1);
	});

	it('gives every level a nextLevel that resolves, except the last', () => {
		levels.forEach((level, index) => {
			if(index < levels.length - 1) {
				expect(getLevelIndex(level.nextLevel ?? '')).toBeGreaterThanOrEqual(0);
			}
		});
	});

	it('uses a portrait playing field so it fits the tall mobile canvas', () => {
		levels.forEach(level => {
			expect(level.bounds.height).toBeGreaterThan(level.bounds.width);
		});
	});

	it('seeds every level\'s player station with the same starting loadout so a carried fleet is reproduced exactly', () => {
		// The player carries their bought upgrades onto the level's player-station base, so for the fleet they left
		// the previous level with to come back unchanged, that base must be identical in every level - only the enemy
		// escalates.  A level seeding the player a bigger base would let their upgrades stack on top of it and jump
		// their fleet forward for free just by advancing (see data/levels/player-start).
		levels.forEach(level => {
			const player = level.entities.find(entity => entity.type === 'station' && entity.player);
			expect(player?.ships).toEqual(PLAYER_START_SHIPS);
		});
	});

	it('lets the enemy base escalate past the player start to ramp difficulty', () => {
		// The whole point of holding the player base constant is that the challenge comes from the enemy instead, so
		// at least one later level must field a tougher enemy than the shared player start does.
		const startLevel = PLAYER_START_SHIPS.skiff?.level ?? 0;
		const enemiesEscalate = levels.some(level => {
			const enemy = level.entities.find(entity => entity.type === 'station' && !entity.player);
			return (enemy?.ships?.skiff?.level ?? 0) > startLevel;
		});
		expect(enemiesEscalate).toBe(true);
	});

	it('holds the player at the bottom centre and every enemy up top', () => {
		levels.forEach(level => {
			const stations = level.entities.filter(entity => entity.type === 'station');
			const players = stations.filter(station => station.player);
			const enemies = stations.filter(station => !station.player);

			// One player station, on the horizontal centre line at the bottom edge (nearest the upgrade buttons).
			expect(players).toHaveLength(1);
			const midX = level.bounds.width / 2;
			const midY = level.bounds.height / 2;
			expect(players[0].x).toBe(midX);
			expect(players[0].y).toBeGreaterThan(midY);

			// One or more enemy stations, all across the top half - a single centre station in the early 1v1 levels,
			// spread into flanks once a level fields two or three so pressure comes from several lanes at once.
			expect(enemies.length).toBeGreaterThanOrEqual(1);
			enemies.forEach(enemy => {
				expect(enemy.y).toBeLessThan(midY);
			});
			// A lone enemy still sits dead centre, facing the player down the middle.
			if(enemies.length === 1) {
				expect(enemies[0].x).toBe(midX);
			}
		});
	});
});
