import { describe, it, expect, afterEach } from 'vitest';
import GameWorld from '../entities/game-world';
import entityList from '../entities/entity-list';
import { factionCollision } from '@/data/collide-categories';
import { SHIP_TYPE_DEFS } from '@/data/ship-types';
import type { HangarConfig } from '../components/hangar';

// A single faction so nothing a spawned ship can collide with exists: its ships share its collide category, so
// they never run into each other and none of them die - every ship a production line launches simply stays in
// the world to be counted.
const RED = 0xff0000;
const RED_FACTION = factionCollision(0);

// The two Phase 2 ship types are distinguished by their hull width, which is intrinsic to the type and does not
// change with level - unlike shields or damage, which is exactly what these tests vary.
const SKIFF_WIDTH = SHIP_TYPE_DEFS.skiff.width;
const GUNNER_WIDTH = SHIP_TYPE_DEFS.gunner.width;

let world: GameWorld | undefined;
afterEach(() => {
	world?.destroy();
	world = undefined;
});

// Every ship (a `controlled` non-projectile) whose hull is the given width - i.e. every ship of one type.
function shipsOfWidth(gameWorld: GameWorld, width: number) {
	return entityList(gameWorld).filter(entity => {
		const transform = entity.components.transform;
		return !!entity.components.controlled && !entity.components.projectile && !!transform
			&& Math.round(transform.width) === width;
	});
}

// A one-station world whose hangar builds whatever `ships` says, with nothing to fight.
async function loadStation(ships: HangarConfig['ships']): Promise<GameWorld> {
	const gameWorld = new GameWorld();
	gameWorld.load({
		bounds: { width: 400, height: 400 },
		entities: [
			{ type: 'station', color: RED, ...RED_FACTION, x: 200, y: 200, ships },
		],
	});
	await gameWorld.init();

	return gameWorld;
}

describe('hangar multi-type spawning', () => {
	it('builds every ship type its hangar carries, each at its own rate', async () => {
		// Skiffs at 3/s and Gunners at 5/s: one second of play should leave exactly that many of each, proving the
		// two lines run at once and independently.
		world = await loadStation({ skiff: { rate: 3, level: 1 }, gunner: { rate: 5, level: 1 } });

		world.update(1_000);

		expect(shipsOfWidth(world, SKIFF_WIDTH)).toHaveLength(3);
		expect(shipsOfWidth(world, GUNNER_WIDTH)).toHaveLength(5);
	});

	it('builds nothing for a type whose line has no rate', async () => {
		// Skiffs build, but the Gunner line is left at rate 0 - a type the station does not (yet) produce.
		world = await loadStation({ skiff: { rate: 5, level: 1 }, gunner: { rate: 0 } });

		world.update(1_000);

		expect(shipsOfWidth(world, SKIFF_WIDTH)).toHaveLength(5);
		expect(shipsOfWidth(world, GUNNER_WIDTH)).toHaveLength(0);
	});

	it('stamps each ship with the shields and damage of its own line\'s level', async () => {
		// The Skiff line is levelled up to 5, the Gunner line left at its base 1.  A Skiff rams, gaining a shield per
		// level and a point of contact damage every fourth, so level 5 is 4 shields and 2 contact damage.  A Gunner
		// shoots instead of ramming (contact damage 0) and starts with one shield; its damage lives on its weapon.
		// One ship of each (rate 1 over a second) is enough to read the stamped values off.
		world = await loadStation({ skiff: { rate: 1, level: 5 }, gunner: { rate: 1, level: 1 } });

		world.update(1_000);

		const skiff = shipsOfWidth(world, SKIFF_WIDTH)[0];
		const gunner = shipsOfWidth(world, GUNNER_WIDTH)[0];
		expect(skiff).toBeDefined();
		expect(gunner).toBeDefined();

		expect(skiff.components.health!.maxShields).toBe(4);
		expect(skiff.components.combat!.contactDamage).toBe(2);
		expect(gunner.components.health!.maxShields).toBe(1);
		expect(gunner.components.combat!.contactDamage).toBe(0);
		expect(gunner.components.weapon!.damage).toBe(1);
	});

	it('stamps a Carrier with the drone count of its line\'s level, so a levelled swarm grows', async () => {
		// The Carrier launches two drones a volley at its base, and one more every level - so a level-4 line stamps
		// five onto every Carrier it builds.  A single faction means no enemy to fire at, so the Carrier simply
		// carries the stamped count without ever launching, which is exactly what we read off it.
		world = await loadStation({ carrier: { rate: 1, level: 4 } });

		world.update(1_000);

		const carrier = shipsOfWidth(world, SHIP_TYPE_DEFS.carrier.width)[0];
		expect(carrier).toBeDefined();
		expect(carrier.components.weapon!.projectileCount).toBe(5);
	});

	it('banks each line\'s spawn progress independently', async () => {
		// Skiffs at 4/s and Gunners at 1/s, stepped a quarter-second at a time: the Skiff line earns a whole ship
		// every frame while the Gunner line only banks a quarter of one, so the first frame launches a Skiff and no
		// Gunner - the Gunner's banked fraction is not swept up by the Skiff line spawning.
		world = await loadStation({ skiff: { rate: 4, level: 1 }, gunner: { rate: 1, level: 1 } });

		world.update(250);
		expect(shipsOfWidth(world, SKIFF_WIDTH)).toHaveLength(1);
		expect(shipsOfWidth(world, GUNNER_WIDTH)).toHaveLength(0);

		// Three more quarter-seconds: the Gunner line's fraction finally adds up to its first whole ship at one
		// second exactly, by which point the Skiff line has launched four.
		world.update(250);
		world.update(250);
		world.update(250);
		expect(shipsOfWidth(world, SKIFF_WIDTH)).toHaveLength(4);
		expect(shipsOfWidth(world, GUNNER_WIDTH)).toHaveLength(1);
	});
});
