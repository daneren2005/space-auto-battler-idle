import { describe, it, expect, beforeEach } from 'vitest';
import { loadProgress, saveProgress, resetProgress, emptyCarry } from '../progress';
import { levels, firstLevel, getLevel, getLevelIndex } from '../levels';

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
		expect(loadProgress()).toEqual({ levelIndex: 0, carry: emptyCarry() });
	});

	it('round-trips a saved progress record', () => {
		const progress = { levelIndex: 1, carry: { openShipUpgrades: 3, shieldUpgrades: 2, money: 7 } };
		saveProgress(progress);
		expect(loadProgress()).toEqual(progress);
	});

	it('backfills missing carry fields from a partial record', () => {
		saveProgress({ levelIndex: 1, carry: { openShipUpgrades: 4 } as never });
		expect(loadProgress()).toEqual({ levelIndex: 1, carry: { openShipUpgrades: 4, shieldUpgrades: 0, money: 0 } });
	});

	it('reset clears back to the default', () => {
		saveProgress({ levelIndex: 2, carry: emptyCarry() });
		resetProgress();
		expect(loadProgress().levelIndex).toBe(0);
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

	it('places the player at the bottom and the enemy at the top, both horizontally centred', () => {
		levels.forEach(level => {
			const stations = level.entities.filter(entity => entity.type === 'station');
			expect(stations).toHaveLength(2);

			const midX = level.bounds.width / 2;
			stations.forEach(station => {
				// Both factions sit on the horizontal centre line so their fleets meet in the middle.
				expect(station.x).toBe(midX);
			});

			// The player holds the bottom edge (nearest the upgrade buttons); the enemy holds the top.
			const midY = level.bounds.height / 2;
			const player = stations.find(station => station.player);
			const enemy = stations.find(station => !station.player);
			expect(player?.y).toBeGreaterThan(midY);
			expect(enemy?.y).toBeLessThan(midY);
		});
	});
});
