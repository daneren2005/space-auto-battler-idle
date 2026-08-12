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

type StationEntity = BaseEntity<Components>;

// Unlock is modelled as a type's first rate + level purchase: it bumps both the value and the bought counter, so
// the rate = base + rateBought invariant (hangar.ts) holds for a built-from-scratch type too.
const UNLOCK_RATE = 1;
const UNLOCK_LEVEL = 1;

// A view + mutator over a station's controller (money) and hangar (rate / level / bought) blocks. The spawn
// worker reads the same blocks, so money/rate/level are touched with Atomics. Lives here (not the scene) so it
// can be unit-tested against a real world.
export default class ShipRoster {
	private controllerBlock: Int32Array;
	private hangarBlock: Int32Array;

	// A live Ascendancy cost discount (Quartermaster). Read through a getter so buying the node mid-run takes effect
	// at once; defaults to no discount so direct/test construction is unaffected.
	constructor(private world: GameWorld, private station: StationEntity, private getCostDiscount: () => number = () => 1) {
		const controller = station.components.controller;
		const hangar = station.components.hangar;
		if(!controller || !hangar) {
			throw new Error('ShipRoster requires a station with both a controller and a hangar');
		}
		// A component's block never moves for the life of its entity, so hold them to skip a registry walk per read.
		this.controllerBlock = this.world.registry.controller.memoryComponent.getBlock(controller.index) as Int32Array;
		this.hangarBlock = this.world.registry.hangar.memoryComponent.getBlock(hangar.index) as Int32Array;
	}

	// --- Reads the UI renders -------------------------------------------------------------------------------

	get money(): number {
		return this.controllerBlock[CONTROLLER_MONEY];
	}

	// Level 0 = the station produces none of it (see hangar.ts).
	isLocked(type: ShipType): boolean {
		return this.hangarBlock[hangarLevelIndex(SHIP_TYPE_INDEX[type])] === 0;
	}

	rate(type: ShipType): number {
		return this.hangarBlock[hangarRateIndex(SHIP_TYPE_INDEX[type])];
	}
	level(type: ShipType): number {
		return this.hangarBlock[hangarLevelIndex(SHIP_TYPE_INDEX[type])];
	}
	shields(type: ShipType): number {
		return shieldsForLevel(SHIP_TYPE_DEFS[type], this.level(type));
	}

	// --- Costs -----------------------------------------------------------------------------------------------

	// Discounts round to whole money so the UI and the spend stay integer.
	private discounted(cost: number): number {
		return Math.round(cost * this.getCostDiscount());
	}

	unlockCost(type: ShipType): number {
		return this.discounted(unlockCost(SHIP_TYPE_DEFS[type]));
	}
	rateCost(type: ShipType): number {
		return this.discounted(rateCost(SHIP_TYPE_DEFS[type], this.hangarBlock[hangarRateBoughtIndex(SHIP_TYPE_INDEX[type])]));
	}
	levelCost(type: ShipType): number {
		return this.discounted(levelCost(SHIP_TYPE_DEFS[type], this.hangarBlock[hangarLevelBoughtIndex(SHIP_TYPE_INDEX[type])]));
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

	// --- Buys. Each returns whether the purchase went through. ----------------------------------------------

	// Starts producing at base rate + level; both bought counters step to 1 so the state carries and prices up.
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
