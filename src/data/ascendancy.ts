// The Ascendancy: the permanent prestige tree spent with Dark Matter. Nodes are run-spanning bonuses applied when
// a run/level loads (see game-scene). Pure + data-driven so it can be unit-tested and the meta record stays thin.

import { SHIP_TYPES, SHIP_TYPE_DEFS, type ShipType } from '@/data/ship-types';

export const ASCENDANCY_NODES = ['salvage', 'standingFleet', 'doctrine', 'quartermaster', 'munitions', 'eventHorizon'] as const;
export type AscendancyNodeId = typeof ASCENDANCY_NODES[number];

// Purchased level per node; a missing node is level 0 (never bought).
export type AscendancyNodes = Partial<Record<AscendancyNodeId, number>>;

export interface AscendancyNodeDef {
	id: AscendancyNodeId
	name: string
	// What one more level grants, phrased for the buy button.
	perLevel: string
	maxLevel: number
	// Dark Matter cost of the next level = round(costBase * costGrowth ** currentLevel).
	costBase: number
	costGrowth: number
	// A later node is dimmed until its prerequisite reaches `level`, giving the tree a shape.
	requires?: { node: AscendancyNodeId, level: number }
}

// Tuning constants for each node's effect. Kept beside the defs so the effect helpers and the copy stay in sync.
// The three combat/economy nodes (Salvage, Doctrine, Munitions) are per-level percentage bonuses the player's run
// carries; their multipliers are written onto the player's controller/hangar blocks and read live by the workers.
// The combat/economy nodes are strong per rank AND cheap with high caps, so the first Singularity buys DEEP into
// them - dozens of ranks, weighted toward Munitions (cheapest + deepest). Damage is the variance-killer: the Act V
// fights are a race against kamikaze Detonator streams, and a fleet that out-damages them ends the race before a
// leak can kill the station, turning the plateau's coin-flip into a clean sweep. A shallow buy instead re-converges
// to a ~50/50 equilibrium only a level or two up (see docs/ai-run.md). Salvage/Doctrine cap at 8, Munitions at 10;
// Quartermaster/Event Horizon stay at 5 so later Singularities still have something left to finish.
const SALVAGE_MONEY_PER_LEVEL = 0.3;
const DOCTRINE_RATE_PER_LEVEL = 0.2;
const MUNITIONS_DAMAGE_PER_LEVEL = 0.2;
const QUARTERMASTER_DISCOUNT_PER_LEVEL = 0.1;
const EVENT_HORIZON_BONUS_PER_LEVEL = 0.1;
const STANDING_FLEET_MAX = 4;

// Dark Matter banked on prestige = floor(K * levelReached ** 1.5 * eventHorizon). Tuned so the first prestige
// (unlocked at the first wall) buys a few nodes and each subsequent run banks noticeably more.
const DARK_MATTER_K = 2;

// Reaching this level (0-based index; level 7, the first wall) is what first offers Enter the Singularity, so a new
// player meets the core loop before the meta layer.
export const PRESTIGE_UNLOCK_LEVEL_INDEX = 6;

// The locked types ordered by unlock price: Standing Fleet pre-unlocks the cheapest of these first.
const UNLOCKABLE_TYPES_BY_COST: ReadonlyArray<ShipType> = SHIP_TYPES
	.filter(type => SHIP_TYPE_DEFS[type].unlockCost > 0)
	.sort((a, b) => SHIP_TYPE_DEFS[a].unlockCost - SHIP_TYPE_DEFS[b].unlockCost);

function pct(fraction: number): number {
	return Math.round(fraction * 100);
}

export const ASCENDANCY_NODE_DEFS: Record<AscendancyNodeId, AscendancyNodeDef> = {
	salvage: {
		id: 'salvage',
		name: 'Salvage',
		perLevel: `+${pct(SALVAGE_MONEY_PER_LEVEL)}% money earned`,
		maxLevel: 8,
		costBase: 2, costGrowth: 1.3,
	},
	standingFleet: {
		id: 'standingFleet',
		name: 'Standing Fleet',
		perLevel: 'Start with one more ship type unlocked',
		maxLevel: STANDING_FLEET_MAX,
		costBase: 4, costGrowth: 1.3,
		requires: { node: 'salvage', level: 1 },
	},
	doctrine: {
		id: 'doctrine',
		name: 'Doctrine',
		perLevel: `+${pct(DOCTRINE_RATE_PER_LEVEL)}% ships/second`,
		maxLevel: 8,
		costBase: 2, costGrowth: 1.3,
		requires: { node: 'salvage', level: 1 },
	},
	quartermaster: {
		id: 'quartermaster',
		name: 'Quartermaster',
		perLevel: `-${pct(QUARTERMASTER_DISCOUNT_PER_LEVEL)}% on all upgrade costs`,
		maxLevel: 5,
		costBase: 4, costGrowth: 1.35,
		requires: { node: 'salvage', level: 1 },
	},
	munitions: {
		id: 'munitions',
		name: 'Munitions',
		perLevel: `+${pct(MUNITIONS_DAMAGE_PER_LEVEL)}% ship damage`,
		maxLevel: 10,
		costBase: 2, costGrowth: 1.25,
		requires: { node: 'doctrine', level: 1 },
	},
	eventHorizon: {
		id: 'eventHorizon',
		name: 'Event Horizon',
		perLevel: `+${pct(EVENT_HORIZON_BONUS_PER_LEVEL)}% Dark Matter per prestige`,
		maxLevel: 5,
		costBase: 10, costGrowth: 1.5,
		requires: { node: 'quartermaster', level: 2 },
	},
};

export function nodeLevel(nodes: AscendancyNodes, id: AscendancyNodeId): number {
	return nodes[id] ?? 0;
}

// --- Effects the run applies at load / prestige time -------------------------------------------------------

// The types a fresh run starts with already unlocked (the cheapest N still-locked types).
export function standingFleetTypes(nodes: AscendancyNodes): ReadonlyArray<ShipType> {
	return UNLOCKABLE_TYPES_BY_COST.slice(0, nodeLevel(nodes, 'standingFleet'));
}

// Multiplier (>= 1) on the money the player earns from kills. Stamped on the player controller, applied by the
// physics worker when it credits a kill.
export function moneyMultiplier(nodes: AscendancyNodes): number {
	return 1 + SALVAGE_MONEY_PER_LEVEL * nodeLevel(nodes, 'salvage');
}

// Multiplier (>= 1) on the player's ships/second. Stamped on the player hangar, applied by the spawn worker.
export function rateMultiplier(nodes: AscendancyNodes): number {
	return 1 + DOCTRINE_RATE_PER_LEVEL * nodeLevel(nodes, 'doctrine');
}

// Multiplier (>= 1) on the player's contact + weapon damage. Stamped on the player hangar, applied at spawn.
export function damageMultiplier(nodes: AscendancyNodes): number {
	return 1 + MUNITIONS_DAMAGE_PER_LEVEL * nodeLevel(nodes, 'munitions');
}

// Multiplier (0,1] applied to every rate/level/unlock cost.
export function costDiscount(nodes: AscendancyNodes): number {
	return 1 - QUARTERMASTER_DISCOUNT_PER_LEVEL * nodeLevel(nodes, 'quartermaster');
}

// Multiplier on Dark Matter banked per prestige.
export function darkMatterMultiplier(nodes: AscendancyNodes): number {
	return 1 + EVENT_HORIZON_BONUS_PER_LEVEL * nodeLevel(nodes, 'eventHorizon');
}

// Dark Matter a prestige would bank for reaching `highestLevelIndex` (0-based), scaled by Event Horizon.
export function darkMatterForLevel(highestLevelIndex: number, nodes: AscendancyNodes): number {
	if(highestLevelIndex < 0) {
		return 0;
	}
	const levelReached = highestLevelIndex + 1;
	return Math.floor(DARK_MATTER_K * levelReached ** 1.5 * darkMatterMultiplier(nodes));
}
