// The headless auto-player engine: it drives the real GameWorld through a campaign, stepping the simulation at a
// fixed rate and, between every step, buying the single cheapest upgrade or ship unlock it can afford.  It is a
// pure simulation with no IO - it yields a stream of structured events (a buy, a level won / lost, the run ending)
// which the scripts/ai-run.ts wrapper formats into its report.  Keeping it here (rather than in the script) is
// what lets it be unit-tested against a real world, the same way GameWorld's own game-loop tests drive it.
//
// Under Node there is no `Worker` global, so shared-memory-ecs runs every system in-process and `world.update()`
// settles a whole frame synchronously (see the vitest.config note) - which is exactly what makes a deterministic
// auto-player possible.  Progression follows the shipped progressAfterMatch rules: a win climbs to the next level,
// a loss drops back one, and either way the money + bought upgrades carry forward.
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
import { emptyCarry, progressAfterMatch, type Carry } from '@/data/progress';
import { SHIP_TYPES, SHIP_TYPE_INDEX, type ShipType } from '@/data/ship-types';

type Station = BaseEntity<Components>;

// One simulation step: a fixed 1/60s frame, in milliseconds (which is what the world / physics measure time in).
export const DEFAULT_STEP_MS = 1000 / 60;
// Abandon a single level attempt that has not resolved after this much game time, so a stalemate can never hang the
// run forever.  Generous - every balanced level resolves in well under a minute - so hitting it flags a problem.
export const DEFAULT_MAX_LEVEL_MS = 20 * 60 * 1000;
// End the whole run once a single level has been lost more than this many times.
export const DEFAULT_MAX_DEATHS_PER_LEVEL = 10;

// One buyable action and what it costs right now.
export interface Action {
	type: ShipType
	kind: 'unlock' | 'rate' | 'level'
	cost: number
}

// The cheapest action available on the roster right now, across every type's unlock / rate / level, or undefined
// if the roster somehow offers nothing.  A locked type offers only its unlock; an unlocked one offers rate + level.
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

// Apply a decided action to the roster (spending the money and bumping the rate / level / bought counters).
export function applyAction(roster: ShipRoster, action: Action): void {
	if(action.kind === 'unlock') {
		roster.unlock(action.type);
	} else if(action.kind === 'rate') {
		roster.buyRate(action.type);
	} else {
		roster.buyLevel(action.type);
	}
}

// The player faction's live state for a log line: its money and, per built type, its rate / level.  Read straight
// off the station's own component accessors so it is valid both while the station is alive (a win) and during the
// entity-removed event that fires the instant it is destroyed (a loss) - the one moment its memory is still live.
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

// Re-apply a carried run onto the freshly loaded player station: each type's bought rate / level add onto both the
// value and the matching bought counter (rebuilding a self-unlocked type whole), and the money is banked.  Mirrors
// GameScene.setupStationsAndCarry - safe as plain writes because nothing has simulated on the new world yet.
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

// Whether the match on the current world is still being played, or has been decided: the player is alive while its
// station exists, and the match is won once no enemy station is left, lost once the player's is gone.
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
	// The campaign to play, in order.  Defaults to the shipped levels; a test can pass a small custom list.
	levels?: Array<LevelConfig>
	stepMs?: number
	maxLevelMs?: number
	maxDeathsPerLevel?: number
}

// Why the run ended.
export type AutoPlayEndReason = 'campaign-cleared' | 'deaths-exceeded' | 'stalled' | 'no-player';

// Everything the auto-player emits as it plays, one object per event.  `totalMs` is the cumulative game time since
// the run began (across every level and retry); `levelMs` on a decision is the time spent on that one attempt.
export type AutoPlayEvent =
	| { type: 'level-start', levelIndex: number, level: LevelConfig, state: StationState, totalMs: number }
	| { type: 'buy', action: Action, rate: number, level: number, moneyLeft: number, totalMs: number }
	| { type: 'win', levelIndex: number, level: LevelConfig, levelMs: number, state: StationState, totalMs: number }
	| { type: 'die', levelIndex: number, level: LevelConfig, levelMs: number, state: StationState, deaths: number, totalMs: number }
	| { type: 'stall', levelIndex: number, level: LevelConfig, levelMs: number, totalMs: number }
	| { type: 'end', reason: AutoPlayEndReason, totalMs: number };

// Plays the campaign to its end, yielding an event for every purchase and every level decision.  It owns the world
// for the length of the run and destroys it when the generator finishes (including an early `break` by the
// consumer), so a caller only has to iterate it.
export async function* autoPlay(options: AutoPlayOptions = {}): AsyncGenerator<AutoPlayEvent> {
	const levels = options.levels ?? campaignLevels;
	const stepMs = options.stepMs ?? DEFAULT_STEP_MS;
	const maxLevelMs = options.maxLevelMs ?? DEFAULT_MAX_LEVEL_MS;
	const maxDeaths = options.maxDeathsPerLevel ?? DEFAULT_MAX_DEATHS_PER_LEVEL;

	// The next level's index within this run's own level list, so a custom campaign progresses through itself rather
	// than being looked up against the shipped one.
	const indexOf = (name: string) => levels.findIndex(level => level.name === name);

	const world = new GameWorld();

	// The player station of the level currently loaded, and the last state it was seen in - captured the instant it
	// is destroyed so a loss can report what the player died holding (its memory is freed just after the event).
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
	let carry: Carry = emptyCarry();
	let totalMs = 0;
	const deaths: Array<number> = Array.from({ length: levels.length }, () => 0);

	try {
		// Each iteration plays one level attempt to a decision, emits it, then follows the progression rules onward.
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
			const roster = new ShipRoster(world, player);

			yield { type: 'level-start', levelIndex, level, state: stationState(player), totalMs };

			let levelMs = 0;
			let outcome: 'won' | 'lost' | 'stalled' = 'stalled';

			while(levelMs < maxLevelMs) {
				// Between steps: spend down to the cheapest thing out of reach, buying cheapest-first.
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
				if(state === 'lost') {
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
				// Read the winning (still-alive) station directly for its ending state and carry.
				yield { type: 'win', levelIndex, level, levelMs, state: stationState(player), totalMs };

				const next = progressAfterMatch('won', levelIndex, nextLevelIndex, carryFromStation(player));
				if(next === 'reset') {
					yield { type: 'end', reason: 'campaign-cleared', totalMs };
					return;
				}
				levelIndex = next.levelIndex;
				carry = next.carry;
			} else {
				// Lost: the player station is already gone, so report the snapshot taken as it died.
				deaths[levelIndex]++;
				yield { type: 'die', levelIndex, level, levelMs, state: lossState, deaths: deaths[levelIndex], totalMs };

				if(deaths[levelIndex] > maxDeaths) {
					yield { type: 'end', reason: 'deaths-exceeded', totalMs };
					return;
				}

				const next = progressAfterMatch('lost', levelIndex, nextLevelIndex, lossCarry);
				// A loss never resets, so `next` is always a Progress here; guard for the type all the same.
				if(next !== 'reset') {
					levelIndex = next.levelIndex;
					carry = next.carry;
				}
			}
		}
	} finally {
		world.destroy();
	}
}
