import { describe, it, expect, afterEach } from 'vitest';
import { killEntity } from '@daneren2005/shared-memory-ecs';
import type { BaseEntity } from '@daneren2005/shared-memory-ecs';
import GameWorld from '../entities/game-world';
import entityList from '../entities/entity-list';
import { factionCollision } from '@/data/collide-categories';
import ShipRoster from '../ship-roster';
import { carryFromStation } from '../player-carry';
import type { Components } from '../components';
import type { Carry } from '@/data/progress';

type Station = BaseEntity<Components>;

let world: GameWorld | undefined;
afterEach(() => {
	world?.destroy();
	world = undefined;
});

// A single player station building Skiffs, flush with money to buy upgrades in the tests below.
async function loadPlayerStation(): Promise<Station> {
	const gameWorld = new GameWorld();
	gameWorld.load({
		bounds: { width: 400, height: 400 },
		entities: [
			{
				type: 'station', color: 0x00ff00, player: true, money: 100000,
				ships: { skiff: { rate: 2, level: 1 } }, ...factionCollision(0), x: 200, y: 380,
			},
		],
	});
	await gameWorld.init();
	world = gameWorld;

	return entityList(gameWorld).find(entity => entity.components.controller?.player)!;
}

describe('carryFromStation', () => {
	it('reads the money and per-type bought upgrades off a live station', async() => {
		const station = await loadPlayerStation();
		const roster = new ShipRoster(world!, station);

		// Bought counters start at zero (the config seeds rate/level, not the bought counts), so these buys are what
		// the carry should report - the bought counts, not the station's total rate/level.
		expect(roster.buyRate('skiff')).toBe(true);
		expect(roster.buyRate('skiff')).toBe(true);
		expect(roster.buyRate('skiff')).toBe(true);
		expect(roster.buyLevel('skiff')).toBe(true);
		expect(roster.buyLevel('skiff')).toBe(true);

		const carry = carryFromStation(station);
		expect(carry.ships.skiff).toEqual({ rate: 3, level: 2 });
		// Money is the same live block the roster spends from, and a type left untouched is simply absent.
		expect(carry.money).toBe(roster.money);
		expect(carry.ships.gunner).toBeUndefined();
	});

	it('is still readable while the player station is being removed - the loss snapshot the scene relies on', async() => {
		// The whole reason the scene snapshots on `entity-removed` rather than at dialog time: the world deletes the
		// station from its map before this event, yet its component memory is live until just after it, so the carry
		// read here matches what the station held the instant before it died (not the zeros a freed station reports).
		const station = await loadPlayerStation();
		const roster = new ShipRoster(world!, station);
		roster.buyRate('skiff');
		roster.buyLevel('skiff');

		const before = carryFromStation(station);
		let captured: Carry | undefined;
		world!.on('entity-removed', (entity: Station) => {
			if(entity.eid === station.eid) {
				captured = carryFromStation(entity);
			}
		});

		killEntity(station);

		expect(world!.getEntityByEid(station.eid)).toBeUndefined();
		expect(captured).toEqual(before);
		expect(captured?.ships.skiff).toEqual({ rate: 1, level: 1 });
	});
});
