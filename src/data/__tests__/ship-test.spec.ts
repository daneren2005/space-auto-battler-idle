import { describe, it, expect } from 'vitest';
import { shipTestLevel, SHIP_TEST_RATE_PER_TYPE, SHIP_TEST_LEVEL_PER_TYPE } from '../levels/ship-test';
import { levels, getLevel } from '../levels';
import { PLAYER_COLOR, ENEMY_COLOR } from '../colors';
import { factionCategory } from '../collide-categories';
import { SHIP_TYPES } from '../ship-types';

describe('ship test level', () => {
	it('is a single 1v1: one player station and one enemy, facing off left vs right', () => {
		const stations = shipTestLevel.entities;
		expect(stations).toHaveLength(2);
		stations.forEach(station => expect(station.type).toBe('station'));

		const players = stations.filter(station => station.player);
		expect(players).toHaveLength(1);
		expect(players[0].color).toBe(PLAYER_COLOR);
		// The player holds the left edge; the single enemy holds the right.
		expect(players[0].x).toBeLessThan(shipTestLevel.bounds.width / 2);

		const enemies = stations.filter(station => !station.player);
		expect(enemies).toHaveLength(1);
		expect(enemies[0].color).toBe(ENEMY_COLOR);
		expect(enemies[0].x).toBeGreaterThan(shipTestLevel.bounds.width / 2);
	});

	it('gives both stations a production line for every ship type at the same rate and level', () => {
		expect(SHIP_TEST_RATE_PER_TYPE).toBeGreaterThan(0);
		expect(SHIP_TEST_LEVEL_PER_TYPE).toBeGreaterThan(0);

		shipTestLevel.entities.forEach(station => {
			const ships = station.ships;
			expect(ships).toBeDefined();
			// Every buildable type is present, so the whole roster is fielded and can be seen at once.
			for(const type of SHIP_TYPES) {
				expect(ships?.[type], `${type} line`).toEqual({ rate: SHIP_TEST_RATE_PER_TYPE, level: SHIP_TEST_LEVEL_PER_TYPE });
			}
		});
	});

	it('gives the two factions their own collide categories so they only fight each other', () => {
		shipTestLevel.entities.forEach((station, faction) => {
			expect(station.collideCategory).toBe(factionCategory(faction));
			expect(station.collideMask).toBe(~factionCategory(faction) >>> 0);
		});
		const categories = shipTestLevel.entities.map(station => station.collideCategory);
		expect(new Set(categories).size).toBe(categories.length);
	});

	it('is a wide map with both stations inside its bounds', () => {
		const { width, height } = shipTestLevel.bounds;
		expect(width).toBeGreaterThan(height);
		shipTestLevel.entities.forEach(station => {
			expect(station.x).toBeGreaterThan(0);
			expect(station.x).toBeLessThan(width);
			expect(station.y).toBeGreaterThan(0);
			expect(station.y).toBeLessThan(height);
		});
	});

	it('stays out of the campaign so it can never be advanced into', () => {
		expect(levels).not.toContain(shipTestLevel);
		expect(getLevel(shipTestLevel.name)).toBeUndefined();
		expect(shipTestLevel.nextLevel).toBeUndefined();
	});
});
