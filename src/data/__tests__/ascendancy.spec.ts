import { describe, it, expect } from 'vitest';
import {
	ASCENDANCY_NODES,
	ASCENDANCY_NODE_DEFS,
	moneyMultiplier,
	rateMultiplier,
	damageMultiplier,
	standingFleetTypes,
	costDiscount,
	darkMatterMultiplier,
	darkMatterForLevel,
	type AscendancyNodes,
} from '../ascendancy';
import { startingCarry, emptyCarry } from '../progress';
import { SHIP_TYPE_DEFS } from '../ship-types';

describe('Ascendancy node defs', () => {
	it('gives every node a coherent, growing cost and a resolvable prerequisite', () => {
		for(const id of ASCENDANCY_NODES) {
			const def = ASCENDANCY_NODE_DEFS[id];
			expect(def.id, `${id} id matches key`).toBe(id);
			expect(def.name.length, `${id} name`).toBeGreaterThan(0);
			expect(def.perLevel.length, `${id} perLevel`).toBeGreaterThan(0);
			expect(def.maxLevel, `${id} maxLevel`).toBeGreaterThan(0);
			expect(def.costBase, `${id} costBase`).toBeGreaterThan(0);
			expect(def.costGrowth, `${id} costGrowth`).toBeGreaterThan(1);
			if(def.requires) {
				expect(ASCENDANCY_NODE_DEFS[def.requires.node], `${id} prereq resolves`).toBeDefined();
				expect(def.requires.level, `${id} prereq level`).toBeGreaterThan(0);
			}
		}
	});
});

describe('Ascendancy effects', () => {
	it('raises the money multiplier with Salvage', () => {
		expect(moneyMultiplier({})).toBe(1);
		expect(moneyMultiplier({ salvage: 2 })).toBeGreaterThan(1);
		expect(moneyMultiplier({ salvage: 3 })).toBeGreaterThan(moneyMultiplier({ salvage: 1 }));
	});

	it('raises the ships/second multiplier with Doctrine', () => {
		expect(rateMultiplier({})).toBe(1);
		expect(rateMultiplier({ doctrine: 3 })).toBeGreaterThan(1);
	});

	it('raises the damage multiplier with Munitions', () => {
		expect(damageMultiplier({})).toBe(1);
		expect(damageMultiplier({ munitions: 4 })).toBeGreaterThan(1);
	});

	it('pre-unlocks the cheapest types first with Standing Fleet', () => {
		expect(standingFleetTypes({})).toHaveLength(0);
		const two = standingFleetTypes({ standingFleet: 2 });
		expect(two).toHaveLength(2);
		// Ordered by unlock cost, cheapest first (the Gunner is the cheapest unlockable type).
		expect(two[0]).toBe('gunner');
		expect(SHIP_TYPE_DEFS[two[0]].unlockCost).toBeLessThanOrEqual(SHIP_TYPE_DEFS[two[1]].unlockCost);
		// Never lists the always-unlocked Skiff.
		expect(two).not.toContain('skiff');
	});

	it('turns Quartermaster levels into a shrinking cost multiplier', () => {
		expect(costDiscount({})).toBe(1);
		expect(costDiscount({ quartermaster: 2 })).toBeLessThan(1);
		expect(costDiscount({ quartermaster: 2 })).toBeGreaterThan(0);
	});

	it('raises the Dark Matter multiplier with Event Horizon', () => {
		expect(darkMatterMultiplier({})).toBe(1);
		expect(darkMatterMultiplier({ eventHorizon: 3 })).toBeGreaterThan(1);
	});
});

describe('darkMatterForLevel', () => {
	it('rewards reaching further, and never pays for a run below the first level', () => {
		expect(darkMatterForLevel(-1, {})).toBe(0);
		const early = darkMatterForLevel(3, {});
		const late = darkMatterForLevel(10, {});
		expect(late).toBeGreaterThan(early);
	});

	it('compounds with Event Horizon', () => {
		const base = darkMatterForLevel(9, {});
		const boosted = darkMatterForLevel(9, { eventHorizon: 5 });
		expect(boosted).toBeGreaterThan(base);
	});
});

describe('startingCarry', () => {
	it('is exactly an empty carry for a player with no Ascendancy nodes', () => {
		expect(startingCarry({})).toEqual(emptyCarry());
	});

	it('seeds Standing Fleet unlocks into the fresh run', () => {
		const nodes: AscendancyNodes = { salvage: 2, standingFleet: 1 };
		const carry = startingCarry(nodes);
		// Salvage is a live multiplier, not starting cash, so the fresh carry holds no money.
		expect(carry.money).toBe(0);
		expect(carry.ships.gunner).toEqual({ rate: 1, level: 1 });
	});
});
