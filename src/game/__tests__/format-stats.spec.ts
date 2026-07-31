import { describe, it, expect } from 'vitest';
import type { TimingStats } from '@daneren2005/shared-memory-ecs';
import formatStats from '../format-stats';
import type { GameStats } from '../game-scene';

// Only max/avg reach the panel, but a snapshot always carries min + samples alongside them.
function timing(avg: number, max: number): TimingStats {
	return { avg, min: 0, max, samples: 10 };
}

const baseStats: GameStats = {
	fps: 59.94,
	timing: {
		update: timing(0.567, 1.234),
		systems: [
			{ name: 'physicsSystem', run: timing(0.2, 0.4), events: timing(0.08, 0.15) },
			{ name: 'spawnShipSystem', run: timing(0.05, 0.1), events: timing(0, 0) },
		],
		events: timing(2.25, 4.5),
	},
	memory: '1.0 KiB / 2.0 KiB',
	stationsCount: 2,
	shipsCount: 8,
	totalCount: 10,
	stationShips: [],
};

describe('formatStats', () => {
	it('renders the frame rate, main-thread timing, each system, and the entity/memory totals', () => {
		const text = formatStats(baseStats);

		expect(text).toBe([
			'fps: 59.9',
			'mainThread: 1.23 (0.57 avg) ms',
			'events: 4.50 (2.25 avg) ms',
			'',
			'worker | main, max (avg) ms',
			'physics: 0.40 (0.20) | 0.15 (0.08)',
			'spawnShip: 0.10 (0.05) | 0.00 (0.00)',
			'',
			'Entities: 10 (2 stations, 8 ships)',
			'Memory: 1.0 KiB / 2.0 KiB',
		].join('\n'));
	});

	it('still renders the summary lines when no systems have reported yet', () => {
		const text = formatStats({ ...baseStats, timing: { ...baseStats.timing, systems: [] } });

		expect(text).toBe([
			'fps: 59.9',
			'mainThread: 1.23 (0.57 avg) ms',
			'events: 4.50 (2.25 avg) ms',
			'',
			'Entities: 10 (2 stations, 8 ships)',
			'Memory: 1.0 KiB / 2.0 KiB',
		].join('\n'));
	});
});
