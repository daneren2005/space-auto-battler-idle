import { describe, it, expect, afterEach } from 'vitest';
import GameWorld from '../entities/game-world';
import entityList from '../entities/entity-list';
import { factionCollision } from '@/data/collide-categories';
import { SHIP_TYPE_DEFS, SHIP_TYPE_INDEX, rateCost, levelCost, unlockCost } from '@/data/ship-types';
import { hangarRateBoughtIndex, hangarLevelBoughtIndex } from '../components/hangar';
import ShipRoster from '../ship-roster';

const RED = 0xff0000;
const RED_FACTION = factionCollision(0);

let world: GameWorld | undefined;
afterEach(() => {
	world?.destroy();
	world = undefined;
});

// A one-station world holding `money` to spend, building the Skiff line (rate 1, level 1) and nothing else - so
// the Skiff reads as unlocked and every other type reads as locked (level 0).
async function loadStation(money: number): Promise<GameWorld> {
	const gameWorld = new GameWorld();
	gameWorld.load({
		bounds: { width: 400, height: 400 },
		entities: [
			{ type: 'station', color: RED, ...RED_FACTION, x: 200, y: 200, money, ships: { skiff: { rate: 1, level: 1 } } },
		],
	});
	await gameWorld.init();

	return gameWorld;
}

// The raw hangar block, so a test can read the bought counters that carry a station's upgrades across levels.
function hangarBlock(gameWorld: GameWorld) {
	const hangar = entityList(gameWorld)[0].components.hangar!;
	return gameWorld.registry.hangar.memoryComponent.getBlock(hangar.index) as Int32Array;
}

describe('upgrade cost curves', () => {
	it('grows the rate and level cost exponentially from the def base', () => {
		// The Gunner uses the shared economy: rate 10 x2, level 5 x2.
		const gunner = SHIP_TYPE_DEFS.gunner;
		expect(rateCost(gunner, 0)).toBe(10);
		expect(rateCost(gunner, 1)).toBe(20);
		expect(rateCost(gunner, 3)).toBe(80);
		expect(levelCost(gunner, 0)).toBe(5);
		expect(levelCost(gunner, 2)).toBe(20);
		// The unlock cost is a flat one-off straight off the def.
		expect(unlockCost(gunner)).toBe(gunner.unlockCost);
		expect(unlockCost(SHIP_TYPE_DEFS.skiff)).toBe(0);
	});
});

describe('ShipRoster', () => {
	it('reads the Skiff as built and every other type as locked', async () => {
		world = await loadStation(0);
		const roster = new ShipRoster(world, entityList(world)[0]);

		expect(roster.isLocked('skiff')).toBe(false);
		expect(roster.isLocked('gunner')).toBe(true);
		expect(roster.rate('skiff')).toBe(1);
		expect(roster.level('skiff')).toBe(1);
	});

	it('buys a rate upgrade: one more ship a second, money spent, and the next one dearer', async () => {
		world = await loadStation(1_000);
		const roster = new ShipRoster(world, entityList(world)[0]);

		// A built type's first rate upgrade is the base cost (bought 0).
		expect(roster.rateCost('skiff')).toBe(SHIP_TYPE_DEFS.skiff.rateCostBase);
		expect(roster.buyRate('skiff')).toBe(true);

		expect(roster.rate('skiff')).toBe(2);
		expect(roster.money).toBe(1_000 - SHIP_TYPE_DEFS.skiff.rateCostBase);
		// The bought counter stepped up, which both prices the next upgrade and is what carries across levels.
		expect(hangarBlock(world)[hangarRateBoughtIndex(SHIP_TYPE_INDEX.skiff)]).toBe(1);
		expect(roster.rateCost('skiff')).toBe(SHIP_TYPE_DEFS.skiff.rateCostBase * SHIP_TYPE_DEFS.skiff.rateCostGrowth);
	});

	it('buys a level upgrade: more shields, money spent, bought counter raised', async () => {
		world = await loadStation(1_000);
		const roster = new ShipRoster(world, entityList(world)[0]);

		const before = roster.shields('skiff');
		expect(roster.buyLevel('skiff')).toBe(true);

		expect(roster.level('skiff')).toBe(2);
		expect(roster.shields('skiff')).toBeGreaterThan(before);
		expect(roster.money).toBe(1_000 - SHIP_TYPE_DEFS.skiff.levelCostBase);
		expect(hangarBlock(world)[hangarLevelBoughtIndex(SHIP_TYPE_INDEX.skiff)]).toBe(1);
	});

	it('unlocks a locked type into a built line at base rate and level', async () => {
		world = await loadStation(1_000);
		const roster = new ShipRoster(world, entityList(world)[0]);

		expect(roster.canUnlock('gunner')).toBe(true);
		expect(roster.unlock('gunner')).toBe(true);

		expect(roster.isLocked('gunner')).toBe(false);
		expect(roster.rate('gunner')).toBe(1);
		expect(roster.level('gunner')).toBe(1);
		expect(roster.money).toBe(1_000 - SHIP_TYPE_DEFS.gunner.unlockCost);
		// Unlock is the type's first rate + level purchase, so both bought counters read 1 - which reconstructs the
		// unlocked line when carried into the next level.
		expect(hangarBlock(world)[hangarRateBoughtIndex(SHIP_TYPE_INDEX.gunner)]).toBe(1);
		expect(hangarBlock(world)[hangarLevelBoughtIndex(SHIP_TYPE_INDEX.gunner)]).toBe(1);
		// It cannot be unlocked twice.
		expect(roster.canUnlock('gunner')).toBe(false);
		expect(roster.unlock('gunner')).toBe(false);
	});

	it('refuses a purchase the player cannot afford, changing nothing', async () => {
		// Enough for neither a Skiff rate upgrade (10) nor a Gunner unlock (40).
		world = await loadStation(5);
		const roster = new ShipRoster(world, entityList(world)[0]);

		expect(roster.canBuyRate('skiff')).toBe(false);
		expect(roster.buyRate('skiff')).toBe(false);
		expect(roster.rate('skiff')).toBe(1);

		expect(roster.canUnlock('gunner')).toBe(false);
		expect(roster.unlock('gunner')).toBe(false);
		expect(roster.isLocked('gunner')).toBe(true);

		// Nothing was spent on the failed attempts.
		expect(roster.money).toBe(5);
	});

	it('refuses to buy rate or level for a still-locked type', async () => {
		world = await loadStation(1_000);
		const roster = new ShipRoster(world, entityList(world)[0]);

		expect(roster.canBuyRate('gunner')).toBe(false);
		expect(roster.buyRate('gunner')).toBe(false);
		expect(roster.canBuyLevel('gunner')).toBe(false);
		expect(roster.buyLevel('gunner')).toBe(false);
		expect(roster.isLocked('gunner')).toBe(true);
		expect(roster.money).toBe(1_000);
	});
});
