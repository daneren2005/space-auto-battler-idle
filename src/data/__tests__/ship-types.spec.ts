import { describe, it, expect } from 'vitest';
import {
	SHIP_TYPE_DEFS, combatStat, nextLevelSummary, killReward, unlockCost,
	shieldsForLevel, weaponDamageForLevel, contactDamageForLevel, projectileCountForLevel,
} from '../ship-types';

describe('combatStat', () => {
	it('names an armed ship\'s damage by its own projectile noun', () => {
		// The Gunner fires bullets for its per-shot damage, not a generic "projectile".
		expect(combatStat(SHIP_TYPE_DEFS.gunner, 1)).toEqual({ label: 'Bullet damage', value: 1 });
		expect(combatStat(SHIP_TYPE_DEFS.scatterGun, 1)).toEqual({ label: 'Pellet damage', value: 1 });
		expect(combatStat(SHIP_TYPE_DEFS.railgunLancer, 1)).toEqual({ label: 'Slug damage', value: 6 });
	});

	it('scales the shown weapon damage with level on the damage cadence', () => {
		// The Gunner now gains damage every level, so by level 5 it is up +4 off its base of 1.
		expect(combatStat(SHIP_TYPE_DEFS.gunner, 5).value).toBe(5);
	});

	it('describes a Carrier by how many drones each launch fields, growing that swarm with level', () => {
		expect(combatStat(SHIP_TYPE_DEFS.carrier, 1)).toEqual({ label: 'Drones/launch', value: 2 });
		// The Carrier adds a drone every level, so the count climbs one per level off its base of 2.
		expect(combatStat(SHIP_TYPE_DEFS.carrier, 4).value).toBe(5);
		expect(combatStat(SHIP_TYPE_DEFS.carrier, 7).value).toBe(8);
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

	it('lists a damage step every level for a damage-focused ship, folding in the occasional shield', () => {
		// The Gunner gains damage every level; its shield comes only occasionally (every 3rd level, first at 4).
		expect(nextLevelSummary(SHIP_TYPE_DEFS.gunner, 1)).toBe('+1 damage');
		expect(nextLevelSummary(SHIP_TYPE_DEFS.gunner, 3)).toBe('+1 shield, +1 damage');
	});

	it('names a swarm ship\'s extra shot in its own terms every level', () => {
		// The Missile Frigate fires one more homing missile every level.
		expect(nextLevelSummary(SHIP_TYPE_DEFS.missileFrigate, 1)).toBe('+1 missile');
		// The 3->4 buy also grants its occasional shield alongside the missile.
		expect(nextLevelSummary(SHIP_TYPE_DEFS.missileFrigate, 3)).toBe('+1 shield, +1 missile');
	});

	it('promises a Carrier an extra drone every level, never damage', () => {
		// A drone every level; its shields come only every 3rd level, so the 3->4 buy adds both.
		expect(nextLevelSummary(SHIP_TYPE_DEFS.carrier, 3)).toBe('+2 shields, +1 drone');
		expect(nextLevelSummary(SHIP_TYPE_DEFS.carrier, 4)).toBe('+1 drone');
	});
});

describe('per-ship progression', () => {
	it('grows the Gunner\'s damage every level and only an occasional shield', () => {
		const gunner = SHIP_TYPE_DEFS.gunner;
		expect([1, 2, 3, 4].map(l => weaponDamageForLevel(gunner, l))).toEqual([1, 2, 3, 4]);
		// Shields come every 3rd level past the first (level 4, 7, ...), off the base of 1.
		expect([1, 2, 3, 4].map(l => shieldsForLevel(gunner, l))).toEqual([1, 1, 1, 2]);
	});

	it('never gives the Wasp a shield at any level', () => {
		expect([1, 2, 5, 10, 20].every(l => shieldsForLevel(SHIP_TYPE_DEFS.wasp, l) === 0)).toBe(true);
	});

	it('adds a Missile Frigate missile every level but its per-missile damage only every 4th', () => {
		const frigate = SHIP_TYPE_DEFS.missileFrigate;
		expect([1, 2, 3, 5].map(l => projectileCountForLevel(frigate, l))).toEqual([3, 4, 5, 7]);
		expect([1, 4, 5, 9].map(l => weaponDamageForLevel(frigate, l))).toEqual([1, 1, 2, 3]);
	});

	it('alternates the Detonator between a bigger blast on even levels and a shield on odd', () => {
		const det = SHIP_TYPE_DEFS.detonator;
		expect([1, 2, 3, 4, 5].map(l => contactDamageForLevel(det, l))).toEqual([4, 5, 5, 6, 6]);
		expect([1, 2, 3, 4, 5].map(l => shieldsForLevel(det, l))).toEqual([0, 0, 1, 1, 2]);
	});

	it('alternates the Stormcaller between more arcs on odd levels and more damage on even', () => {
		const storm = SHIP_TYPE_DEFS.stormcaller;
		expect([1, 2, 3, 4, 5].map(l => projectileCountForLevel(storm, l))).toEqual([3, 3, 4, 4, 5]);
		expect([1, 2, 3, 4, 5].map(l => weaponDamageForLevel(storm, l))).toEqual([1, 2, 2, 3, 3]);
	});

	it('adds a drone to the Carrier every level', () => {
		expect([1, 2, 3, 4].map(l => projectileCountForLevel(SHIP_TYPE_DEFS.carrier, l))).toEqual([2, 3, 4, 5]);
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
