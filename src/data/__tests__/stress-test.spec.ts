import { describe, it, expect } from 'vitest';
import { stressTestLevel, SHIPS_PER_SECOND_PER_FACTION, STRESS_TEST_FACTIONS } from '../levels/stress-test';
import { levels, getLevel } from '../levels';
import { FACTION_PALETTE, PLAYER_COLOR } from '../colors';
import { factionCategory } from '../collide-categories';

describe('stress test level', () => {
	it('fields one faction per palette colour, using every colour once', () => {
		const stations = stressTestLevel.entities;

		expect(stations).toHaveLength(STRESS_TEST_FACTIONS);
		expect(STRESS_TEST_FACTIONS).toBe(FACTION_PALETTE.length);
		expect(stations.map(station => station.color)).toEqual(FACTION_PALETTE);
		stations.forEach(station => {
			expect(station.type).toBe('station');
		});
	});

	it('gives every faction the same punishing Skiff line', () => {
		// The point of the level is the entity count, so this only guards the floor - raise
		// SHIPS_PER_SECOND_PER_FACTION freely.
		expect(SHIPS_PER_SECOND_PER_FACTION).toBeGreaterThanOrEqual(100);
		stressTestLevel.entities.forEach(station => {
			expect(station.ships).toEqual({ skiff: { rate: SHIPS_PER_SECOND_PER_FACTION, level: 2 } });
		});
	});

	it('gives each faction its own collide category so they only fight each other', () => {
		stressTestLevel.entities.forEach((station, faction) => {
			expect(station.collideCategory).toBe(factionCategory(faction));
			// Collides with everything except its own bit, so a faction's ships fly through each other.
			expect(station.collideMask).toBe(~factionCategory(faction) >>> 0);
		});

		const categories = stressTestLevel.entities.map(station => station.collideCategory);
		expect(new Set(categories).size).toBe(categories.length);
	});

	it('has exactly one player faction, in the player colour, at the bottom of the ring', () => {
		const players = stressTestLevel.entities.filter(station => station.player);

		expect(players).toHaveLength(1);
		expect(players[0].color).toBe(PLAYER_COLOR);
		expect(players[0].x).toBe(stressTestLevel.bounds.width / 2);
		expect(players[0].y).toBeGreaterThan(stressTestLevel.bounds.height / 2);
	});

	it('is a wide map, with every station inside its bounds', () => {
		const { width, height } = stressTestLevel.bounds;
		expect(width).toBeGreaterThan(height);

		stressTestLevel.entities.forEach(station => {
			expect(station.x).toBeGreaterThan(0);
			expect(station.x).toBeLessThan(width);
			expect(station.y).toBeGreaterThan(0);
			expect(station.y).toBeLessThan(height);
		});
	});

	it('spreads the factions over the whole map in two facing rows', () => {
		const { width, height } = stressTestLevel.bounds;
		const xs = stressTestLevel.entities.map(station => station.x!);
		const ys = stressTestLevel.entities.map(station => station.y!);

		// The rows reach both edges, so the fighting covers the width rather than clumping in the middle.
		expect(Math.min(...xs)).toBeLessThan(width * 0.15);
		expect(Math.max(...xs)).toBeGreaterThan(width * 0.85);
		// Half of them hold the bottom edge and half the top, and nothing sits in between.
		const [top, bottom] = [Math.min(...ys), Math.max(...ys)];
		expect(top).toBeLessThan(height / 2);
		expect(bottom).toBeGreaterThan(height / 2);
		ys.forEach(y => expect([top, bottom]).toContain(y));
		expect(ys.filter(y => y === bottom)).toHaveLength(Math.ceil(STRESS_TEST_FACTIONS / 2));
	});

	it('stays out of the campaign so it can never be advanced into', () => {
		expect(levels).not.toContain(stressTestLevel);
		expect(getLevel(stressTestLevel.name)).toBeUndefined();
		expect(stressTestLevel.nextLevel).toBeUndefined();
	});
});
