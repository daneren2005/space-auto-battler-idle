import { describe, it, expect } from 'vitest';
import { FACTION_COLORS, FACTION_PALETTE, PLAYER_COLOR, ENEMY_COLOR, factionColor } from '../colors';
import { levels } from '../levels';

describe('faction colors', () => {
	it('exposes the player and enemy colours from the shared palette', () => {
		expect(PLAYER_COLOR).toBe(FACTION_COLORS.player);
		expect(ENEMY_COLOR).toBe(FACTION_COLORS.enemy);
		expect(PLAYER_COLOR).not.toBe(ENEMY_COLOR);
	});

	it('lists every named colour in the palette, without duplicates', () => {
		expect(FACTION_PALETTE).toEqual(Object.values(FACTION_COLORS));
		expect(new Set(FACTION_PALETTE).size).toBe(FACTION_PALETTE.length);
	});

	it('hands out palette colours in order', () => {
		FACTION_PALETTE.forEach((color, index) => {
			expect(factionColor(index)).toBe(color);
		});
	});

	it('wraps around once the palette runs out so every faction gets a colour', () => {
		expect(factionColor(FACTION_PALETTE.length)).toBe(FACTION_PALETTE[0]);
		expect(factionColor(FACTION_PALETTE.length + 3)).toBe(FACTION_PALETTE[3]);
		expect(factionColor(-1)).toBe(FACTION_PALETTE[1]);
	});
});

describe('level colours', () => {
	it('colours every level station from the shared palette rather than a local literal', () => {
		levels.forEach(level => {
			level.entities.filter(entity => entity.type === 'station').forEach(station => {
				expect(FACTION_PALETTE).toContain(station.color);
			});
		});
	});

	it('gives the player station the player colour and its opponents a different one', () => {
		levels.forEach(level => {
			const stations = level.entities.filter(entity => entity.type === 'station');
			const players = stations.filter(station => station.player);

			expect(players).toHaveLength(1);
			expect(players[0].color).toBe(PLAYER_COLOR);
			stations.filter(station => !station.player).forEach(station => {
				expect(station.color).not.toBe(PLAYER_COLOR);
			});
		});
	});
});
