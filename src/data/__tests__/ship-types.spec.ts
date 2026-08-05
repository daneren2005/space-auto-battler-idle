import { describe, it, expect } from 'vitest';
import { SHIP_TYPE_DEFS, combatStat, nextLevelSummary, killReward, unlockCost } from '../ship-types';

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

	it('describes a Carrier by how many drones each launch fields, growing that swarm with level', () => {
		expect(combatStat(SHIP_TYPE_DEFS.carrier, 1)).toEqual({ label: 'Drones/launch', value: 2 });
		// Every third level past the first adds a drone to the launch, so the count climbs off its base of 2.
		expect(combatStat(SHIP_TYPE_DEFS.carrier, 4).value).toBe(3);
		expect(combatStat(SHIP_TYPE_DEFS.carrier, 7).value).toBe(4);
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

	it('promises a Carrier extra drones on the level that adds one, never damage', () => {
		// Its swarm grows every third level, so the 3->4 buy adds a drone while the 4->5 buy is only shields.
		expect(nextLevelSummary(SHIP_TYPE_DEFS.carrier, 3)).toBe('+2 shields, +1 drone');
		expect(nextLevelSummary(SHIP_TYPE_DEFS.carrier, 4)).toBe('+2 shields');
	});
});

describe('killReward', () => {
	it('is worth more for a pricier ship than the cheap Skiff', () => {
		// The Skiff is the disposable starter and pays the flat one; the Carrier, the roster's most expensive hull,
		// is worth the most to kill.
		expect(killReward(SHIP_TYPE_DEFS.skiff)).toBe(1);
		expect(killReward(SHIP_TYPE_DEFS.carrier)).toBeGreaterThan(killReward(SHIP_TYPE_DEFS.gunner));
		expect(killReward(SHIP_TYPE_DEFS.gunner)).toBeGreaterThan(killReward(SHIP_TYPE_DEFS.skiff));
	});

	it('is a positive whole number for every type, so it can be added to the integer money bank', () => {
		for(const def of Object.values(SHIP_TYPE_DEFS)) {
			expect(Number.isInteger(killReward(def))).toBe(true);
			expect(killReward(def)).toBeGreaterThan(0);
		}
	});

	it('never pays out less for a type than a cheaper one to unlock', () => {
		// The reward tracks a type's price, so ordering types by unlock cost never sees the bounty go backwards.
		const byPrice = Object.values(SHIP_TYPE_DEFS).sort((a, b) => unlockCost(a) - unlockCost(b));
		for(let i = 1; i < byPrice.length; i++) {
			expect(killReward(byPrice[i])).toBeGreaterThanOrEqual(killReward(byPrice[i - 1]));
		}
	});
});
