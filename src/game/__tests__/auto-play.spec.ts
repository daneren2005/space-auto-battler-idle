import { describe, it, expect, afterEach } from 'vitest';
import { killEntity } from '@daneren2005/shared-memory-ecs';
import type { BaseEntity } from '@daneren2005/shared-memory-ecs';
import GameWorld from '../entities/game-world';
import entityList from '../entities/entity-list';
import ShipRoster from '../ship-roster';
import type { Components } from '../components';
import { factionCollision } from '@/data/collide-categories';
import type { LevelConfig } from '@/data/levels';
import type { Carry } from '@/data/progress';
import { SHIP_TYPE_DEFS } from '@/data/ship-types';
import {
	cheapestAction,
	applyAction,
	applyCarry,
	matchOutcome,
	stationState,
	autoPlay,
	type AutoPlayEvent,
} from '../auto-play';

type Station = BaseEntity<Components>;

let world: GameWorld | undefined;
afterEach(() => {
	world?.destroy();
	world = undefined;
});

// A single player station building Skiffs, with as much money as the test needs to buy against.
async function loadPlayerStation(money: number, ships = { skiff: { rate: 5, level: 1 } }): Promise<{ station: Station, roster: ShipRoster }> {
	const gameWorld = new GameWorld();
	gameWorld.load({
		bounds: { width: 400, height: 400 },
		entities: [
			{ type: 'station', color: 0x00ff00, player: true, money, ships, ...factionCollision(0), x: 200, y: 380 },
		],
	});
	await gameWorld.init();
	world = gameWorld;

	const station = entityList(gameWorld).find(entity => entity.components.controller?.player)!;
	return { station, roster: new ShipRoster(gameWorld, station) };
}

describe('cheapestAction', () => {
	it('picks the single cheapest option across every type', async() => {
		const { roster } = await loadPlayerStation(0);

		// The only unlocked line is the Skiff, whose cheapest upgrade is a level ($5, cheaper than its $10 rate); every
		// other type is locked and its unlock ($40+) is dearer, so the Skiff level is the cheapest action anywhere.
		const action = cheapestAction(roster)!;
		expect(action).toEqual({ type: 'skiff', kind: 'level', cost: SHIP_TYPE_DEFS.skiff.levelCostBase });
	});

	it('offers a locked type only its unlock, and an unlocked one its rate and level', async() => {
		// Flush with money and forced to buy: unlock the Gunner, then the cheapest action should be one of the Gunner's
		// own rate / level upgrades or another line's - never the Gunner unlock again, which is now spent.
		const { roster } = await loadPlayerStation(1_000);
		expect(roster.unlock('gunner')).toBe(true);

		const action = cheapestAction(roster)!;
		expect(action.kind === 'unlock' && action.type === 'gunner').toBe(false);
	});
});

describe('applyAction', () => {
	it('spends money and raises the matching counter for a rate buy', async() => {
		const { roster } = await loadPlayerStation(1_000);
		const before = roster.money;
		const cost = roster.rateCost('skiff');

		applyAction(roster, { type: 'skiff', kind: 'rate', cost });

		expect(roster.rate('skiff')).toBe(6);
		expect(roster.money).toBe(before - cost);
	});

	it('unlocks a locked type', async() => {
		const { roster } = await loadPlayerStation(1_000);
		expect(roster.isLocked('gunner')).toBe(true);

		applyAction(roster, { type: 'gunner', kind: 'unlock', cost: roster.unlockCost('gunner') });

		expect(roster.isLocked('gunner')).toBe(false);
		expect(roster.rate('gunner')).toBe(1);
	});
});

describe('applyCarry', () => {
	it('rebuilds a carried line and banks the carried money onto a fresh station', async() => {
		const { station, roster } = await loadPlayerStation(0);
		const carry: Carry = { money: 50, ships: { gunner: { rate: 2, level: 1 } } };

		applyCarry(world!, station, carry);

		// The Gunner was absent from the level (locked); the carry rebuilds it whole - rate 2, level 1 - and its bought
		// counters with it, and the money is banked on top of what the station had.
		expect(roster.isLocked('gunner')).toBe(false);
		expect(roster.rate('gunner')).toBe(2);
		expect(roster.level('gunner')).toBe(1);
		expect(roster.money).toBe(50);
	});
});

describe('stationState', () => {
	it('reports the station money and each built type as rate/level', async() => {
		const { station } = await loadPlayerStation(7);
		const state = stationState(station);

		expect(state.money).toBe(7);
		expect(state.summary).toContain('skiff r5/l1');
	});
});

describe('matchOutcome', () => {
	async function loadTwoStations(): Promise<{ player: Station, enemy: Station }> {
		const gameWorld = new GameWorld();
		gameWorld.load({
			bounds: { width: 400, height: 400 },
			entities: [
				{ type: 'station', color: 0x00ff00, player: true, ...factionCollision(0), x: 100, y: 300 },
				{ type: 'station', color: 0xff0000, ...factionCollision(1), x: 300, y: 100 },
			],
		});
		await gameWorld.init();
		world = gameWorld;

		const player = entityList(gameWorld).find(entity => entity.components.controller?.player)!;
		const enemy = entityList(gameWorld).find(entity => !entity.components.controller?.player)!;
		return { player, enemy };
	}

	it('is playing while both stations stand', async() => {
		const { player } = await loadTwoStations();
		expect(matchOutcome(world!, player.eid)).toBe('playing');
	});

	it('is won once no enemy station is left', async() => {
		const { player, enemy } = await loadTwoStations();
		killEntity(enemy);
		expect(matchOutcome(world!, player.eid)).toBe('won');
	});

	it('is lost once the player station is gone', async() => {
		const { player } = await loadTwoStations();
		killEntity(player);
		expect(matchOutcome(world!, player.eid)).toBe('lost');
	});
});

// --- The campaign generator -----------------------------------------------------------------------------------

// A level the player cannot help but win: it fields a Skiff line against a defenceless enemy station (no ships, no
// shields) on a small map, so its ships ram the enemy station down in seconds and it can never take damage itself.
function winnableLevel(name: string, nextLevel?: string, money = 0): LevelConfig {
	return {
		name,
		title: name,
		bounds: { width: 200, height: 200 },
		nextLevel,
		entities: [
			{ type: 'station', color: 0x00ff00, player: true, money, ships: { skiff: { rate: 5, level: 1 } }, ...factionCollision(0), x: 100, y: 160 },
			{ type: 'station', color: 0xff0000, maxShields: 0, ...factionCollision(1), x: 100, y: 40 },
		],
	};
}

// A level the player cannot win: it builds nothing, its station has no shields, and a defenceless-side enemy floods
// a fast Skiff swarm across a tiny map - so the swarm rams the player station down and there is no way back.
function unwinnableLevel(name: string): LevelConfig {
	return {
		name,
		title: name,
		bounds: { width: 100, height: 100 },
		entities: [
			{ type: 'station', color: 0x00ff00, player: true, maxShields: 0, ...factionCollision(0), x: 50, y: 50 },
			{ type: 'station', color: 0xff0000, ships: { skiff: { rate: 50, level: 1 } }, ...factionCollision(1), x: 50, y: 90 },
		],
	};
}

async function collect(events: AsyncGenerator<AutoPlayEvent>): Promise<Array<AutoPlayEvent>> {
	const out: Array<AutoPlayEvent> = [];
	for await (const event of events) {
		out.push(event);
	}
	return out;
}

describe('autoPlay', () => {
	it('wins a single winnable level and ends the run as a cleared campaign', async() => {
		const events = await collect(autoPlay({ levels: [winnableLevel('solo')] }));

		expect(events[0]).toMatchObject({ type: 'level-start', levelIndex: 0 });
		expect(events.some(event => event.type === 'win' && event.level.name === 'solo')).toBe(true);
		expect(events.at(-1)).toMatchObject({ type: 'end', reason: 'campaign-cleared' });
	}, 20_000);

	it('carries bought upgrades and money forward into the next level', async() => {
		// Enough starting money that the greedy buyer upgrades the Skiff before clearing the first level, so the second
		// level must open with a fleet past the level-1 base and some money still in hand.
		const events = await collect(autoPlay({
			levels: [winnableLevel('first', 'second', 200), winnableLevel('second')],
		}));

		const secondStart = events.find(event => event.type === 'level-start' && event.level.name === 'second');
		expect(secondStart).toBeDefined();
		if(secondStart?.type === 'level-start') {
			// A carried Skiff line: the base is rate 5 / level 1, so any buy on level one shows up as more here.
			expect(secondStart.state.summary).toMatch(/skiff r(\d+)\/l(\d+)/);
			const [, rate, level] = secondStart.state.summary.match(/skiff r(\d+)\/l(\d+)/)!;
			expect(Number(rate) + Number(level)).toBeGreaterThan(6);
		}
		expect(events.some(event => event.type === 'buy')).toBe(true);
	}, 20_000);

	it('stops the run after losing a single level more than the death cap allows', async() => {
		const events = await collect(autoPlay({
			levels: [unwinnableLevel('wall')],
			maxLevelMs: 30_000,
			maxDeathsPerLevel: 2,
		}));

		const dies = events.filter(event => event.type === 'die');
		// The cap is "more than 2", so it plays a third loss before ending.
		expect(dies).toHaveLength(3);
		expect(dies.every(event => event.type === 'die' && event.level.name === 'wall')).toBe(true);
		expect(events.at(-1)).toMatchObject({ type: 'end', reason: 'deaths-exceeded' });
	}, 30_000);

	it('prestiges once a level past the unlock is lost too many times, banks Dark Matter, buys a node, and restarts', async() => {
		// Two winnable levels lead into a wall at index 2; with the unlock lowered to 0 the run can prestige off that
		// peak (Dark Matter for reaching level 3 is enough to afford the cheapest node). The second time it grinds out
		// on the same wall it can't better its peak, so it ends as prestige-stalled instead of looping forever.
		const events = await collect(autoPlay({
			levels: [winnableLevel('a', 'b'), winnableLevel('b', 'wall'), unwinnableLevel('wall')],
			maxLevelMs: 30_000,
			prestigeAfterDeaths: 2,
			prestigeUnlockLevelIndex: 0,
		}));

		const prestiges = events.filter(event => event.type === 'prestige');
		expect(prestiges.length).toBeGreaterThanOrEqual(1);
		expect(prestiges[0]).toMatchObject({ type: 'prestige', highestLevelIndex: 2 });
		if(prestiges[0].type === 'prestige') {
			expect(prestiges[0].banked).toBeGreaterThan(0);
		}

		// The first node the greedy buyer can afford is the cheapest, Salvage, and the run restarts from level 1.
		const nodes = events.filter(event => event.type === 'buy-node');
		expect(nodes.some(event => event.type === 'buy-node' && event.id === 'salvage')).toBe(true);
		const restart = events.findIndex(event => event.type === 'prestige');
		expect(events.slice(restart).some(event => event.type === 'level-start' && event.levelIndex === 0)).toBe(true);

		expect(events.at(-1)).toMatchObject({ type: 'end', reason: 'prestige-stalled' });
	}, 60_000);
});
