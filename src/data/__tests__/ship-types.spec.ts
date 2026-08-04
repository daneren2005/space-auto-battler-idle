import { describe, it, expect } from 'vitest';
import { SHIP_TYPE_DEFS, combatStat, nextLevelSummary } from '../ship-types';

describe('combatStat', () => {
	it('names an armed ship\'s damage by its own projectile noun', () => {
		// The Gunner fires bullets for its per-shot damage, not a generic "projectile".
		expect(combatStat(SHIP_TYPE_DEFS.gunner, 1)).toEqual({ label: 'Bullet damage', value: 1 });
		expect(combatStat(SHIP_TYPE_DEFS.scatterGun, 1)).toEqual({ label: 'Pellet damage', value: 1 });
		expect(combatStat(SHIP_TYPE_DEFS.railgunLancer, 1)).toEqual({ label: 'Slug damage', value: 6 });
	});

	it('scales the shown weapon damage with level on the damage cadence', () => {
		// The Gunner uses the default 4-levels-per-damage cadence: level 5 is the first with +1 damage.
		expect(combatStat(SHIP_TYPE_DEFS.gunner, 5).value).toBe(2);
	});

	it('describes a Carrier by how many drones each launch fields, not damage', () => {
		expect(combatStat(SHIP_TYPE_DEFS.carrier, 1)).toEqual({ label: 'Drones/launch', value: 2 });
		// A Carrier's drones fly at fixed stats, so the number does not move with level.
		expect(combatStat(SHIP_TYPE_DEFS.carrier, 9).value).toBe(2);
	});

	it('shows a Detonator\'s blast and a Skiff\'s ram for the unarmed types', () => {
		expect(combatStat(SHIP_TYPE_DEFS.detonator, 1)).toEqual({ label: 'Blast damage', value: 4 });
		expect(combatStat(SHIP_TYPE_DEFS.skiff, 1)).toEqual({ label: 'Ram damage', value: 1 });
	});
});

describe('nextLevelSummary', () => {
	it('always lists the shields the next level adds, pluralised', () => {
		// The Skiff gains one shield a level (default), so its preview reads the singular.
		expect(nextLevelSummary(SHIP_TYPE_DEFS.skiff, 1)).toBe('+1 shield');
		// The Bulwark gains two shields a level.
		expect(nextLevelSummary(SHIP_TYPE_DEFS.bulwark, 1)).toBe('+2 shields');
	});

	it('adds the damage term only on the level that steps damage up', () => {
		// Levels 1-3 buy only shields; the 4->5 buy is the one that also grants +1 damage.
		expect(nextLevelSummary(SHIP_TYPE_DEFS.gunner, 1)).toBe('+1 shield');
		expect(nextLevelSummary(SHIP_TYPE_DEFS.gunner, 4)).toBe('+1 shield, +1 damage');
	});

	it('never promises a Carrier damage, since its drones do not scale', () => {
		expect(nextLevelSummary(SHIP_TYPE_DEFS.carrier, 4)).toBe('+2 shields');
	});
});
