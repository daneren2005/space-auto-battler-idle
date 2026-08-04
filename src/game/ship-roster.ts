import type { BaseEntity } from '@daneren2005/shared-memory-ecs';
import {
	SHIP_TYPE_INDEX,
	SHIP_TYPE_DEFS,
	shieldsForLevel,
	unlockCost,
	rateCost,
	levelCost,
	type ShipType,
} from '@/data/ship-types';
import type { Components } from './components';
import { CONTROLLER_MONEY } from './components/controller';
import {
	hangarRateIndex,
	hangarLevelIndex,
	hangarRateBoughtIndex,
	hangarLevelBoughtIndex,
} from './components/hangar';
import type GameWorld from './entities/game-world';

// A station as its roster sees it: an entity that carries both a controller (money) and a hangar (production).
type StationEntity = BaseEntity<Components>;

// The rate a freshly unlocked type starts producing at, and the level it starts at (1 = base, unlocked).  Unlock
// is modelled as the type's first rate + level purchase - it bumps both the value and the "bought" counter that
// prices later upgrades and carries across levels - so the rate = base + rateBought invariant (see hangar.ts)
// holds for a built-from-scratch type exactly as it does for one seeded by a level config.
const UNLOCK_RATE = 1;
const UNLOCK_LEVEL = 1;

// The per-type upgrade economy for one station, driving the roster UI's costs/affordability and applying its buys.
// It is purely a view + mutator over the station's controller (money) and hangar (rate / level / bought counters)
// shared-memory blocks: the same blocks the spawn worker reads, so anything it reads and the main thread writes
// (money, rate, level) is touched with Atomics, following the pattern the old two upgrade buttons used.  The
// GameScene owns the player's roster and exposes it to the UI; keeping the money/hangar maths here (rather than in
// the Phaser scene) is what lets it be unit-tested against a real world without a renderer.
export default class ShipRoster {
	private controllerBlock: Int32Array;
	private hangarBlock: Int32Array;

	constructor(private world: GameWorld, private station: StationEntity) {
		const controller = station.components.controller;
		const hangar = station.components.hangar;
		if(!controller || !hangar) {
			throw new Error('ShipRoster requires a station with both a controller and a hangar');
		}
		// The blocks are fixed views into the shared heap resolved once: a component's block never moves or is
		// swapped out for the life of its entity, so holding them saves a registry walk on every read and buy.
		this.controllerBlock = this.world.registry.controller.memoryComponent.getBlock(controller.index) as Int32Array;
		this.hangarBlock = this.world.registry.hangar.memoryComponent.getBlock(hangar.index) as Int32Array;
	}

	// --- Reads the UI renders -------------------------------------------------------------------------------

	get money(): number {
		return this.controllerBlock[CONTROLLER_MONEY];
	}

	// A type is locked until it is built: level 0 means the station produces none of it (see hangar.ts).
	isLocked(type: ShipType): boolean {
		return this.hangarBlock[hangarLevelIndex(SHIP_TYPE_INDEX[type])] === 0;
	}

	rate(type: ShipType): number {
		return this.hangarBlock[hangarRateIndex(SHIP_TYPE_INDEX[type])];
	}
	level(type: ShipType): number {
		return this.hangarBlock[hangarLevelIndex(SHIP_TYPE_INDEX[type])];
	}
	// How many shields a ship of this type currently spawns with, for the card's stat line.
	shields(type: ShipType): number {
		return shieldsForLevel(SHIP_TYPE_DEFS[type], this.level(type));
	}

	// --- Costs (all pure functions of the def + how many upgrades have been bought) -------------------------

	unlockCost(type: ShipType): number {
		return unlockCost(SHIP_TYPE_DEFS[type]);
	}
	rateCost(type: ShipType): number {
		return rateCost(SHIP_TYPE_DEFS[type], this.hangarBlock[hangarRateBoughtIndex(SHIP_TYPE_INDEX[type])]);
	}
	levelCost(type: ShipType): number {
		return levelCost(SHIP_TYPE_DEFS[type], this.hangarBlock[hangarLevelBoughtIndex(SHIP_TYPE_INDEX[type])]);
	}

	canUnlock(type: ShipType): boolean {
		return this.isLocked(type) && this.money >= this.unlockCost(type);
	}
	canBuyRate(type: ShipType): boolean {
		return !this.isLocked(type) && this.money >= this.rateCost(type);
	}
	canBuyLevel(type: ShipType): boolean {
		return !this.isLocked(type) && this.money >= this.levelCost(type);
	}

	// --- Buys.  Each returns whether the purchase went through. ---------------------------------------------

	// Unlock a locked type: it starts producing at the base rate + level, and both bought counters step to 1 so the
	// state reconstructs when carried into the next level (see hangar.ts / progress.ts) and later upgrades price up.
	unlock(type: ShipType): boolean {
		if(!this.canUnlock(type)) {
			return false;
		}

		const idx = SHIP_TYPE_INDEX[type];
		Atomics.sub(this.controllerBlock, CONTROLLER_MONEY, this.unlockCost(type));
		Atomics.add(this.hangarBlock, hangarRateIndex(idx), UNLOCK_RATE);
		Atomics.add(this.hangarBlock, hangarLevelIndex(idx), UNLOCK_LEVEL);
		this.hangarBlock[hangarRateBoughtIndex(idx)] += 1;
		this.hangarBlock[hangarLevelBoughtIndex(idx)] += 1;
		return true;
	}

	// Spend money to launch one more ship of this type a second.
	buyRate(type: ShipType): boolean {
		if(!this.canBuyRate(type)) {
			return false;
		}

		const idx = SHIP_TYPE_INDEX[type];
		Atomics.sub(this.controllerBlock, CONTROLLER_MONEY, this.rateCost(type));
		Atomics.add(this.hangarBlock, hangarRateIndex(idx), 1);
		this.hangarBlock[hangarRateBoughtIndex(idx)] += 1;
		return true;
	}

	// Spend money to raise this type's level, giving every future ship of it more shields (and, on the slower
	// cadence, more damage).
	buyLevel(type: ShipType): boolean {
		if(!this.canBuyLevel(type)) {
			return false;
		}

		const idx = SHIP_TYPE_INDEX[type];
		Atomics.sub(this.controllerBlock, CONTROLLER_MONEY, this.levelCost(type));
		Atomics.add(this.hangarBlock, hangarLevelIndex(idx), 1);
		this.hangarBlock[hangarLevelBoughtIndex(idx)] += 1;
		return true;
	}
}
