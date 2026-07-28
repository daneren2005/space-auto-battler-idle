import { describe, it, expect } from 'vitest';
import formatStats from '../format-stats';
import type { GameStats } from '../game-scene';

const baseStats: GameStats = {
	maxUpdateTime: 1.234,
	avgUpdateTime: 0.567,
	memory: '1.0 KiB / 2.0 KiB',
	stationsCount: 2,
	shipsCount: 8,
	totalCount: 10,
	stationShips: [],
	systemUpdates: [
		{ name: 'collision', max: 0.4, avg: 0.2 },
		{ name: 'velocity', max: 0.1, avg: 0.05 },
	],
};

describe('formatStats', () => {
	it('renders the main-thread timing, each system, and the entity/memory totals', () => {
		const text = formatStats(baseStats);

		expect(text).toBe([
			'mainThread: 1.23 (0.57 avg) ms',
			'collision: 0.40 (0.20 avg) ms',
			'velocity: 0.10 (0.05 avg) ms',
			'',
			'Entities: 10 (2 stations, 8 ships)',
			'Memory: 1.0 KiB / 2.0 KiB',
		].join('\n'));
	});

	it('still renders the summary lines when no systems have reported yet', () => {
		const text = formatStats({ ...baseStats, systemUpdates: [] });

		expect(text).toBe([
			'mainThread: 1.23 (0.57 avg) ms',
			'',
			'Entities: 10 (2 stations, 8 ships)',
			'Memory: 1.0 KiB / 2.0 KiB',
		].join('\n'));
	});
});
