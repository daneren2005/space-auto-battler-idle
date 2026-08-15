// Headless auto-player: drives the real GameWorld through a campaign, stepping at a fixed rate and buying the
// cheapest affordable upgrade between steps. Pure, IO-free - it yields structured events that scripts/ai-run.ts
// formats. Living here lets it be unit-tested against a real world.
//
// Under Node there is no `Worker` global, so every system runs in-process and `world.update()` settles a frame
// synchronously - which is what makes a deterministic auto-player possible.
import type { BaseEntity } from '@daneren2005/shared-memory-ecs';
import GameWorld from './entities/game-world';
import entityList from './entities/entity-list';
import ShipRoster from './ship-roster';
import type { Components } from './components';
import { carryFromStation } from './player-carry';
import {
	hangarRateIndex,
	hangarLevelIndex,
	hangarRateBoughtIndex,
	hangarLevelBoughtIndex,
} from './components/hangar';
import { levels as campaignLevels, type LevelConfig } from '@/data/levels';
import { emptyCarry, startingCarry, progressAfterMatch, type Carry } from '@/data/progress';
import { emptyMeta, canBuyNode, nodeCost, buyNode, type Meta } from '@/data/meta';
import {
	ASCENDANCY_NODES,
	nodeLevel,
	moneyMultiplier,
	rateMultiplier,
	damageMultiplier,
	costDiscount,
	darkMatterForLevel,
	PRESTIGE_UNLOCK_LEVEL_INDEX,
	type AscendancyNodeId,
} from '@/data/ascendancy';
import { SHIP_TYPES, SHIP_TYPE_INDEX, type ShipType } from '@/data/ship-types';

type Station = BaseEntity<Components>;

// One fixed 1/60s frame, in milliseconds.
export const DEFAULT_STEP_MS = 1000 / 60;
// Abandon a level attempt unresolved after this much game time, so a stalemate can't hang the run. Generous, so
// hitting it flags a problem.
export const DEFAULT_MAX_LEVEL_MS = 20 * 60 * 1000;
export const DEFAULT_MAX_DEATHS_PER_LEVEL = 10;
// If a level's live-entity count ever runs past this, the fight has degenerated into an attrition stalemate the
// greedy AI can't break (ships pile up faster than either side clears them). Sitting in it would only bloat the
// sim toward a freeze, so the auto-player calls the attempt a loss and drops back to grind - exactly what a real
// player facing an un-winnable wall does. Well above any decisive fight's peak, so only a true stall trips it.
export const DEFAULT_STALEMATE_ENTITY_CAP = 4000;
// Once a level has been lost more than this many times, the auto-player collapses the run into a Singularity -
// banks Dark Matter, buys Ascendancy nodes, restarts from level 1 - instead of grinding a wall forever, provided
// prestige is unlocked (the run has reached PRESTIGE_UNLOCK_LEVEL_INDEX). Until then DEFAULT_MAX_DEATHS_PER_LEVEL
// stays the hard cap that ends a run stuck below the prestige wall.
export const DEFAULT_PRESTIGE_AFTER_DEATHS = 5;

// One buyable action and what it costs right now.
export interface Action {
	type: ShipType
	kind: 'unlock' | 'rate' | 'level'
	cost: number
}

// The cheapest action across every type's unlock / rate / level. A locked type offers only its unlock.
export function cheapestAction(roster: ShipRoster): Action | undefined {
	let best: Action | undefined;
	for(const type of SHIP_TYPES) {
		const options: Array<Omit<Action, 'type'>> = roster.isLocked(type)
			? [{ kind: 'unlock', cost: roster.unlockCost(type) }]
			: [{ kind: 'rate', cost: roster.rateCost(type) }, { kind: 'level', cost: roster.levelCost(type) }];
		for(const option of options) {
			if(!best || option.cost < best.cost) {
				best = { type, ...option };
			}
		}
	}
	return best;
}

export function applyAction(roster: ShipRoster, action: Action): void {
	if(action.kind === 'unlock') {
		roster.unlock(action.type);
	} else if(action.kind === 'rate') {
		roster.buyRate(action.type);
	} else {
		roster.buyLevel(action.type);
	}
}

// The player faction's live state for a log line: money and per-built-type rate / level. Read off the station's
// accessors so it's valid both while alive (a win) and during the entity-removed event (a loss).
export interface StationState {
	money: number
	summary: string
}
export function stationState(station: Station): StationState {
	const hangar = station.components.hangar;
	const parts: Array<string> = [];
	if(hangar) {
		for(const type of SHIP_TYPES) {
			const idx = SHIP_TYPE_INDEX[type];
			const level = hangar.level(idx);
			if(level > 0) {
				parts.push(`${type} r${hangar.rate(idx)}/l${level}`);
			}
		}
	}
	return {
		money: station.components.controller?.money ?? 0,
		summary: parts.length ? parts.join(' ') : '(none)',
	};
}

// Re-apply a carried run onto the fresh player station. Mirrors GameScene.setupStationsAndCarry - safe as plain
// writes because nothing has simulated on the new world yet.
export function applyCarry(world: GameWorld, station: Station, carry: Carry): void {
	const hangar = station.components.hangar;
	const controller = station.components.controller;
	if(!hangar || !controller) {
		return;
	}
	const block = world.registry.hangar.memoryComponent.getBlock(hangar.index) as Int32Array;
	for(const type of SHIP_TYPES) {
		const ship = carry.ships[type];
		if(!ship) {
			continue;
		}
		const idx = SHIP_TYPE_INDEX[type];
		block[hangarRateIndex(idx)] += ship.rate;
		block[hangarLevelIndex(idx)] += ship.level;
		block[hangarRateBoughtIndex(idx)] += ship.rate;
		block[hangarLevelBoughtIndex(idx)] += ship.level;
	}
	controller.money += carry.money;
}

// Won once no enemy station is left, lost once the player's is gone.
export function matchOutcome(world: GameWorld, playerEid: number): 'playing' | 'won' | 'lost' {
	let playerAlive = false;
	let enemyAlive = false;
	world.entities.forEach(entity => {
		if(!entity.components.controller) {
			return;
		}
		if(entity.eid === playerEid) {
			playerAlive = true;
		} else {
			enemyAlive = true;
		}
	});
	if(!playerAlive) {
		return 'lost';
	}
	return enemyAlive ? 'playing' : 'won';
}

export interface AutoPlayOptions {
	// Defaults to the shipped levels; a test can pass a small custom list.
	levels?: Array<LevelConfig>
	stepMs?: number
	maxLevelMs?: number
	maxDeathsPerLevel?: number
	// Lose a level more than this many times (with prestige unlocked) and the run collapses into a Singularity.
	prestigeAfterDeaths?: number
	// Live-entity count at which a level is abandoned as an un-winnable stalemate (counts as a loss).
	stalemateEntityCap?: number
	// The peak level index a run must reach before it can prestige. Defaults to the campaign's; a test lowers it so a
	// short custom level list can prestige too.
	prestigeUnlockLevelIndex?: number
	// Fixed by default so a report or test run replays identically; override for a randomized run.
	seed?: number
}

// A constant so the greedy auto-player's RNG-driven bits (launch velocities, strafe offsets) are reproducible.
export const DEFAULT_AUTO_PLAY_SEED = 1;

export type AutoPlayEndReason = 'campaign-cleared' | 'deaths-exceeded' | 'prestige-stalled' | 'stalled' | 'no-player';

// `totalMs` is cumulative game time since the run began; `levelMs` on a decision is time spent on that attempt.
// `darkMatter` on a win/die is what's banked at that point, so the report can track it level by level.
export type AutoPlayEvent =
	| { type: 'level-start', levelIndex: number, level: LevelConfig, state: StationState, totalMs: number }
	| { type: 'buy', action: Action, rate: number, level: number, moneyLeft: number, totalMs: number }
	| { type: 'win', levelIndex: number, level: LevelConfig, levelMs: number, state: StationState, darkMatter: number, totalMs: number }
	| { type: 'die', levelIndex: number, level: LevelConfig, levelMs: number, state: StationState, deaths: number, darkMatter: number, totalMs: number }
	| { type: 'prestige', banked: number, darkMatter: number, highestLevelIndex: number, totalMs: number }
	| { type: 'buy-node', id: AscendancyNodeId, cost: number, nodeLevel: number, darkMatterLeft: number, totalMs: number }
	| { type: 'stall', levelIndex: number, level: LevelConfig, levelMs: number, totalMs: number }
	| { type: 'end', reason: AutoPlayEndReason, totalMs: number };

// Plays the campaign to its end, yielding an event per purchase and per level decision. Owns the world and
// destroys it when the generator finishes (including an early `break`).
export async function* autoPlay(options: AutoPlayOptions = {}): AsyncGenerator<AutoPlayEvent> {
	const levels = options.levels ?? campaignLevels;
	const stepMs = options.stepMs ?? DEFAULT_STEP_MS;
	const maxLevelMs = options.maxLevelMs ?? DEFAULT_MAX_LEVEL_MS;
	const maxDeaths = options.maxDeathsPerLevel ?? DEFAULT_MAX_DEATHS_PER_LEVEL;
	const prestigeAfterDeaths = options.prestigeAfterDeaths ?? DEFAULT_PRESTIGE_AFTER_DEATHS;
	const prestigeUnlockLevelIndex = options.prestigeUnlockLevelIndex ?? PRESTIGE_UNLOCK_LEVEL_INDEX;
	const stalemateEntityCap = options.stalemateEntityCap ?? DEFAULT_STALEMATE_ENTITY_CAP;

	// Index within this run's own level list, so a custom campaign progresses through itself.
	const indexOf = (name: string) => levels.findIndex(level => level.name === name);

	const world = new GameWorld(options.seed ?? DEFAULT_AUTO_PLAY_SEED);

	// The last state the player station was seen in, captured the instant it dies so a loss can report it.
	let playerEid = -1;
	let lossCarry: Carry = emptyCarry();
	let lossState: StationState = { money: 0, summary: '(none)' };
	world.on('entity-removed', (entity: Station) => {
		if(entity.eid === playerEid) {
			lossCarry = carryFromStation(entity);
			lossState = stationState(entity);
		}
	});

	let levelIndex = 0;
	let highestLevelIndex = 0;
	let carry: Carry = emptyCarry();
	let totalMs = 0;
	const deaths: Array<number> = Array.from({ length: levels.length }, () => 0);

	// The prestige meta accrues across the whole run: each Singularity banks Dark Matter and buys Ascendancy nodes,
	// and those bonuses persist through every later reset. `lastPrestigePeak` is the highest level the *previous*
	// prestige had reached, so a Singularity that can't better it means the run has stalled for good.
	let meta: Meta = emptyMeta();
	let lastPrestigePeak = -1;

	try {
		// Each iteration plays one level attempt to a decision, then follows the progression rules onward.
		for(;;) {
			const level = levels[levelIndex];

			world.load({ entities: level.entities, bounds: level.bounds });
			await world.init();

			const player = entityList(world).find(entity => entity.components.controller?.player);
			if(!player) {
				yield { type: 'end', reason: 'no-player', totalMs };
				return;
			}
			playerEid = player.eid;
			applyCarry(world, player, carry);

			// Mirror GameScene.setupStationsAndCarry: stamp the run's prestige multipliers onto the player's blocks so
			// the workers apply Salvage / Doctrine / Munitions live, and give the roster the Quartermaster discount.
			const controller = player.components.controller;
			const hangar = player.components.hangar;
			if(controller && hangar) {
				controller.moneyMultiplier = moneyMultiplier(meta.nodes);
				hangar.rateMultiplier = rateMultiplier(meta.nodes);
				hangar.damageMultiplier = damageMultiplier(meta.nodes);
			}
			const roster = new ShipRoster(world, player, () => costDiscount(meta.nodes));

			yield { type: 'level-start', levelIndex, level, state: stationState(player), totalMs };

			let levelMs = 0;
			let outcome: 'won' | 'lost' | 'stalled' = 'stalled';

			while(levelMs < maxLevelMs) {
				// Spend down, buying cheapest-first, until the cheapest is out of reach.
				for(;;) {
					const action = cheapestAction(roster);
					if(!action || action.cost > roster.money) {
						break;
					}
					applyAction(roster, action);
					yield {
						type: 'buy', action,
						rate: roster.rate(action.type), level: roster.level(action.type), moneyLeft: roster.money, totalMs,
					};
				}

				world.update(stepMs);
				totalMs += stepMs;
				levelMs += stepMs;

				const state = matchOutcome(world, playerEid);
				if(state === 'won') {
					outcome = 'won';
					break;
				}
				// A runaway pile-up is an un-winnable stalemate: treat it as a loss so the run drops back and grinds.
				if(state === 'lost' || world.entities.size > stalemateEntityCap) {
					outcome = 'lost';
					break;
				}
			}

			const nextLevelIndex = level.nextLevel ? indexOf(level.nextLevel) : -1;

			if(outcome === 'stalled') {
				yield { type: 'stall', levelIndex, level, levelMs, totalMs };
				yield { type: 'end', reason: 'stalled', totalMs };
				return;
			}

			if(outcome === 'won') {
				yield { type: 'win', levelIndex, level, levelMs, state: stationState(player), darkMatter: meta.darkMatter, totalMs };

				const next = progressAfterMatch('won', levelIndex, nextLevelIndex, carryFromStation(player), highestLevelIndex);
				if(next === 'reset') {
					yield { type: 'end', reason: 'campaign-cleared', totalMs };
					return;
				}
				levelIndex = next.levelIndex;
				highestLevelIndex = next.highestLevelIndex;
				carry = next.carry;
			} else {
				// Two ways to lose: the player station died (its snapshot rode the entity-removed event) or the level
				// hit the stalemate cap with the player still standing (read it live). carryFromStation only works while
				// the entity exists, so pick the right source for each.
				const playerDied = matchOutcome(world, playerEid) === 'lost';
				const dieState = playerDied ? lossState : stationState(player);
				const dieCarry = playerDied ? lossCarry : carryFromStation(player);
				deaths[levelIndex]++;
				yield { type: 'die', levelIndex, level, levelMs, state: dieState, deaths: deaths[levelIndex], darkMatter: meta.darkMatter, totalMs };

				// Ground down on a wall past the prestige threshold: collapse into a Singularity rather than grind on.
				const prestigeReady = highestLevelIndex >= prestigeUnlockLevelIndex;
				if(deaths[levelIndex] > prestigeAfterDeaths && prestigeReady) {
					// A prestige that can't push past the previous one's peak would loop forever - the run has stalled.
					if(highestLevelIndex <= lastPrestigePeak) {
						yield { type: 'end', reason: 'prestige-stalled', totalMs };
						return;
					}
					lastPrestigePeak = highestLevelIndex;

					const banked = darkMatterForLevel(highestLevelIndex, meta.nodes);
					meta = { ...meta, darkMatter: meta.darkMatter + banked };
					yield { type: 'prestige', banked, darkMatter: meta.darkMatter, highestLevelIndex, totalMs };

					// Greedily buy the cheapest affordable node until nothing more is in reach (prereqs unlock as it goes).
					for(;;) {
						let best: { id: AscendancyNodeId, cost: number } | undefined;
						for(const id of ASCENDANCY_NODES) {
							if(canBuyNode(meta, id)) {
								const cost = nodeCost(meta, id);
								if(!best || cost < best.cost) {
									best = { id, cost };
								}
							}
						}
						if(!best) {
							break;
						}
						meta = buyNode(meta, best.id);
						yield {
							type: 'buy-node', id: best.id, cost: best.cost,
							nodeLevel: nodeLevel(meta.nodes, best.id), darkMatterLeft: meta.darkMatter, totalMs,
						};
					}

					// Collapse the run: back to level 1 with the prestige-seeded carry and a clean death count.
					levelIndex = 0;
					highestLevelIndex = 0;
					carry = startingCarry(meta.nodes);
					deaths.fill(0);
					continue;
				}

				if(deaths[levelIndex] > maxDeaths) {
					yield { type: 'end', reason: 'deaths-exceeded', totalMs };
					return;
				}

				const next = progressAfterMatch('lost', levelIndex, nextLevelIndex, dieCarry, highestLevelIndex);
				// A loss never resets; guard for the type all the same.
				if(next !== 'reset') {
					levelIndex = next.levelIndex;
					highestLevelIndex = next.highestLevelIndex;
					carry = next.carry;
				}
			}
		}
	} finally {
		world.destroy();
	}
}
