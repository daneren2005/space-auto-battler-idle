import { describe, it, expect } from 'vitest';
import { levels, getLevelIndex } from '../index';
import { PLAYER_START_SHIPS } from '../player-start';
import { levelReport } from '@/data/level-balance';
import { PLAYER_COLOR, ENEMY_COLOR } from '@/data/colors';
import { factionCategory } from '@/data/collide-categories';
import { SHIP_TYPES, type ShipType } from '@/data/ship-types';

// The campaign levels are pure hand-authored data, so these tests guard the invariants the game engine relies on
// but the type system can't (the level chain is threaded by string name; enemy stations must be set up as one
// allied faction; difficulty must actually escalate).  They read each level's entities structurally - the level
// Config union carries station fields (player, color, collide bits, ships) only when the entity is a station.
interface StationEntity {
	type?: string
	x?: number
	y?: number
	player?: boolean
	color?: number
	collideCategory?: number
	ships?: Partial<Record<ShipType, { rate?: number, level?: number }>>
}

function stationsOf(levelIndex: number): Array<StationEntity> {
	return (levels[levelIndex].entities as Array<StationEntity>).filter(entity => entity.type === 'station');
}

function playerStations(levelIndex: number): Array<StationEntity> {
	return stationsOf(levelIndex).filter(station => station.player);
}

function enemyStations(levelIndex: number): Array<StationEntity> {
	return stationsOf(levelIndex).filter(station => !station.player);
}

const SHIP_TYPE_SET = new Set<string>(SHIP_TYPES);

describe('campaign chain', () => {
	it('has the 16 authored levels in order', () => {
		expect(levels.map(level => level.name)).toEqual(
			Array.from({ length: 16 }, (_, i) => `level-${i + 1}`),
		);
	});

	it('gives every level a unique name', () => {
		const names = levels.map(level => level.name);
		expect(new Set(names).size).toBe(names.length);
	});

	it('chains each level to the next by name, except the final wall', () => {
		levels.forEach((level, index) => {
			if(index < levels.length - 1) {
				expect(level.nextLevel).toBe(levels[index + 1].name);
				// A nextLevel must resolve to a registered level, or advancing would dead-end.
				expect(getLevelIndex(level.nextLevel!)).toBe(index + 1);
			} else {
				// The last level is the prestige wall: no nextLevel, so a win falls back to "Play Again" (see game-scene).
				expect(level.nextLevel).toBeUndefined();
			}
		});
	});
});

describe('campaign stations', () => {
	it('gives every level exactly one player station, at the player colour', () => {
		levels.forEach((_, index) => {
			const players = playerStations(index);
			expect(players).toHaveLength(1);
			expect(players[0].color).toBe(PLAYER_COLOR);
			// Faction 0 is the player in a hand-authored level (see collide-categories).
			expect(players[0].collideCategory).toBe(factionCategory(0));
		});
	});

	it('carries the shared starting loadout on every player station, so the carried fleet reproduces exactly', () => {
		levels.forEach((_, index) => {
			expect(playerStations(index)[0].ships).toBe(PLAYER_START_SHIPS);
		});
	});

	it('gives every level at least one opponent station', () => {
		levels.forEach((_, index) => {
			expect(enemyStations(index).length).toBeGreaterThanOrEqual(1);
		});
	});

	it('sets every enemy station up as one allied faction (shared bit + colour), so they gang up not fight', () => {
		levels.forEach((_, index) => {
			for(const enemy of enemyStations(index)) {
				expect(enemy.color).toBe(ENEMY_COLOR);
				// All enemy stations share faction 1's category bit, so their ships pass through each other and only
				// ever collide with (and target) the player - the "allied" model the multi-station levels rely on.
				expect(enemy.collideCategory).toBe(factionCategory(1));
			}
		});
	});

	it('positions every station within the level bounds', () => {
		levels.forEach((level, index) => {
			for(const station of stationsOf(index)) {
				expect(station.x).toBeGreaterThanOrEqual(0);
				expect(station.x).toBeLessThanOrEqual(level.bounds.width);
				expect(station.y).toBeGreaterThanOrEqual(0);
				expect(station.y).toBeLessThanOrEqual(level.bounds.height);
			}
		});
	});
});

describe('campaign fleets', () => {
	it('only ever builds real ship types at a positive rate', () => {
		levels.forEach((_, index) => {
			for(const enemy of enemyStations(index)) {
				for(const [type, line] of Object.entries(enemy.ships ?? {})) {
					expect(SHIP_TYPE_SET.has(type)).toBe(true);
					expect(line?.rate ?? 0).toBeGreaterThan(0);
				}
			}
		});
	});

	it('escalates: each level costs at least as much to out-build as the one before', () => {
		// Fleet cost is what the player would pay to field the same enemy line (see level-balance); the campaign is
		// tuned so it never drops from one level to the next, keeping the player continually a little behind.
		const totals = levels.map(level => levelReport(level).totalCost);
		for(let i = 1; i < totals.length; i++) {
			expect(totals[i]).toBeGreaterThanOrEqual(totals[i - 1]);
		}
	});

	it('makes the final wall the most expensive fleet in the campaign', () => {
		const totals = levels.map(level => levelReport(level).totalCost);
		const wall = totals[totals.length - 1];
		expect(wall).toBe(Math.max(...totals));
		expect(wall).toBeGreaterThan(totals[totals.length - 2]);
	});
});
