import { describe, it, expect } from 'vitest';
import {
	lineCost,
	opponentReport,
	levelReport,
	isOpponentStation,
	buildMarkdown,
} from '../level-balance';
import {
	SHIP_TYPE_DEFS,
	rateCost,
	levelCost,
	killReward,
} from '../ship-types';
import { level2 } from '../levels/level-2';
import type { LevelConfig } from '../levels';

describe('lineCost', () => {
	it('costs the always-free Skiff base (rate 1 / level 1) at nothing', () => {
		expect(lineCost('skiff', SHIP_TYPE_DEFS.skiff, 1, 1)).toEqual({
			unlock: 0,
			rateUps: 0,
			levelUps: 0,
			total: 0,
		});
	});

	it('prices the Skiff\'s extra rate and level from bought-count 0 (no unlock)', () => {
		const def = SHIP_TYPE_DEFS.skiff;
		// rate 1 -> 3 is two rate buys at bought 0 and 1; level 1 -> 2 is one level buy at bought 0.
		const rateUps = rateCost(def, 0) + rateCost(def, 1);
		const levelUps = levelCost(def, 0);
		expect(lineCost('skiff', def, 3, 2)).toEqual({
			unlock: 0,
			rateUps,
			levelUps,
			total: rateUps + levelUps,
		});
	});

	it('includes the unlock for a non-Skiff and prices upgrades from bought-count 1', () => {
		const def = SHIP_TYPE_DEFS.gunner;
		// The unlock seeds rate 1 / level 1 and steps both counters to 1, so the next buys are priced at bought 1.
		const rateUps = rateCost(def, 1) + rateCost(def, 2);
		const levelUps = levelCost(def, 1);
		expect(lineCost('gunner', def, 3, 2)).toEqual({
			unlock: def.unlockCost,
			rateUps,
			levelUps,
			total: def.unlockCost + rateUps + levelUps,
		});
	});

	it('charges only the unlock for a freshly built non-Skiff (rate 1 / level 1)', () => {
		const def = SHIP_TYPE_DEFS.carrier;
		expect(lineCost('carrier', def, 1, 1)).toEqual({
			unlock: def.unlockCost,
			rateUps: 0,
			levelUps: 0,
			total: def.unlockCost,
		});
	});
});

describe('opponentReport', () => {
	it('sums per-line cost and rate x reward income across a roster', () => {
		const report = opponentReport({
			type: 'station',
			color: 0xd50000,
			ships: { skiff: { rate: 3, level: 2 }, gunner: { rate: 2, level: 1 } },
		});

		const skiff = lineCost('skiff', SHIP_TYPE_DEFS.skiff, 3, 2).total;
		const gunner = lineCost('gunner', SHIP_TYPE_DEFS.gunner, 2, 1).total;
		expect(report.totalCost).toBe(skiff + gunner);

		const income = 3 * killReward(SHIP_TYPE_DEFS.skiff) + 2 * killReward(SHIP_TYPE_DEFS.gunner);
		expect(report.totalIncomePerSecond).toBe(income);
		expect(report.lines.map(line => line.type)).toEqual(['skiff', 'gunner']);
	});

	it('skips locked / rate-0 lines and defaults a built line to level 1', () => {
		const report = opponentReport({
			type: 'station',
			ships: { skiff: { rate: 2 }, gunner: { rate: 0 } },
		});
		expect(report.lines).toHaveLength(1);
		expect(report.lines[0]).toMatchObject({ type: 'skiff', rate: 2, level: 1 });
	});
});

describe('isOpponentStation', () => {
	it('is true only for non-player stations', () => {
		expect(isOpponentStation({ type: 'station' })).toBe(true);
		expect(isOpponentStation({ type: 'station', player: true })).toBe(false);
		expect(isOpponentStation({ type: 'skiff' })).toBe(false);
	});
});

describe('levelReport', () => {
	it('reports level-2\'s enemy Skiff line and its income', () => {
		const report = levelReport(level2);
		expect(report.name).toBe('level-2');
		expect(report.opponents).toHaveLength(1);

		const opponent = report.opponents[0];
		expect(opponent.lines).toHaveLength(1);
		// Enemy builds a Skiff line at rate 3 / level 2 (see level-2.ts), so income is 3 x the Skiff reward.
		expect(opponent.totalIncomePerSecond).toBe(3 * killReward(SHIP_TYPE_DEFS.skiff));
		expect(report.totalCost).toBe(opponent.totalCost);
	});

	it('reports a level with no opponents', () => {
		const empty: LevelConfig = {
			name: 'empty',
			title: 'Empty',
			bounds: { width: 100, height: 100 },
			entities: [{ type: 'station', player: true }],
		};
		const report = levelReport(empty);
		expect(report.opponents).toHaveLength(0);
		expect(report.totalCost).toBe(0);
		expect(report.totalIncomePerSecond).toBe(0);
	});
});

describe('buildMarkdown', () => {
	it('renders a heading, a per-level section and a totals row', () => {
		const markdown = buildMarkdown();
		expect(markdown).toContain('# Level Balance Report');
		expect(markdown).toContain('## level-1 - First Contact');
		expect(markdown).toContain('## level-2 - Escalation');
		expect(markdown).toContain('| **Total** |');
	});
});
