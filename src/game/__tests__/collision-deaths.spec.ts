import { describe, it, expect, afterEach, vi } from 'vitest';
import GameWorld from '../entities/game-world';
import entityList from '../entities/entity-list';
import { factionCollision } from '@/data/collide-categories';

// Same two-faction setup as the weapon tests: colour decides targeting, the collide category decides who collides.
const RED = 0xff0000;
const RED_FACTION = factionCollision(0);
const BLUE_FACTION = factionCollision(1);

let world: GameWorld | undefined;
afterEach(() => {
	world?.destroy();
	world = undefined;
	vi.restoreAllMocks();
});

describe('collision deaths', () => {
	// A detonator that blasts a station kills the whole fleet (station death) AND blasts the fleet ships directly, so
	// a fleet ship is reached by two kill paths in one physics run. Each kill must emit at most one death event, or
	// the main thread removes the entity on the first and warns "Could not find entity" on the second.
	it('does not kill a fleet ship twice when a blast destroys its station and the ship together', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

		world = new GameWorld();
		world.load({
			bounds: { width: 400, height: 400 },
			entities: [
				// A blue detonator sitting on top of a red station, close enough to a red fleet ship that one blast
				// (radius 40) engulfs both.
				{ type: 'station', color: RED, ...RED_FACTION, x: 200, y: 200 },
			],
		});
		await world.init();
		const redStation = entityList(world)[0];

		const fleetShip = world.loadEntity({
			type: 'skiff', x: 215, y: 200, owner: redStation.eid, ...RED_FACTION, maxShields: 1, timeToRegenerateShields: 1000,
		});
		const fleetEid = fleetShip.eid;
		const stationEid = redStation.eid;

		world.loadEntity({ type: 'detonator', x: 200, y: 200, ...BLUE_FACTION });

		// Longer than the 0.2s damage cooldown so the blast lands this frame.
		world.update(250);

		expect(world.getEntityByEid(stationEid)).toBeUndefined();
		expect(world.getEntityByEid(fleetEid)).toBeUndefined();
		expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('Could not find entity with id'));
	});

	// The library reports a collision once per pair, for whichever entity is processed first, and a detonator
	// resolves the whole contact from that single call - so it must still blast when the call reaches it as `other`
	// (its victim processed first). Loading the victim before the detonator makes it the earlier one, pinning the
	// detonator to the `other` side; before the fix its blast was skipped and the victim flew through unharmed.
	it('detonates when it is the `other` side of a collision', async () => {
		world = new GameWorld();
		world.load({ bounds: { width: 400, height: 400 }, entities: [] });
		await world.init();

		// Both sit on the same spot. The victim is loaded first, so it is `self` and the blue detonator is `other`.
		const victim = world.loadEntity({
			type: 'skiff', x: 200, y: 200, ...RED_FACTION, maxShields: 1, timeToRegenerateShields: 1000,
		});
		world.loadEntity({ type: 'detonator', x: 200, y: 200, ...BLUE_FACTION });
		const victimEid = victim.eid;

		// Longer than the 0.2s damage cooldown so the blast lands this frame.
		world.update(250);

		expect(world.getEntityByEid(victimEid)).toBeUndefined();
	});
});
