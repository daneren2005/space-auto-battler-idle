import { describe, it, expect, afterEach } from 'vitest';
import GameWorld from '../entities/game-world';
import entityList from '../entities/entity-list';
import { factionCollision } from '@/data/collide-categories';

// Colour decides who targets whom; the collide category decides who actually collides.  Two factions so a red
// ship acquires a blue enemy to fight (and vice versa), the same setup the targeting tests use.
const RED = 0xff0000;
const BLUE = 0x0000ff;
const RED_FACTION = factionCollision(0);
const BLUE_FACTION = factionCollision(1);

let world: GameWorld | undefined;
afterEach(() => {
	world?.destroy();
	world = undefined;
});

// Two stations, one of each colour, neither spawning on its own - so the only ships in the world are the ones a
// test places by hand, each built from its type's real template (which is what carries the standoff + strafe wiring).
async function loadTwoStations(): Promise<GameWorld> {
	const gameWorld = new GameWorld();
	gameWorld.load({
		bounds: { width: 600, height: 600 },
		entities: [
			{ type: 'station', color: RED, ...RED_FACTION, x: 20, y: 20 },
			{ type: 'station', color: BLUE, ...BLUE_FACTION, x: 580, y: 580 },
		],
	});
	await gameWorld.init();

	return gameWorld;
}

function speed(velocity: { velocityX: number, velocityY: number }): number {
	return Math.hypot(velocity.velocityX, velocity.velocityY);
}

describe('armed ship standoff', () => {
	it('holds position instead of charging once its target is inside firing range', async () => {
		world = await loadTwoStations();
		const redStation = entityList(world)[0];
		const blueStation = entityList(world)[1];

		// A Gunner (weapon range 120, so it holds at 120) with a blue enemy 60px away - well inside that range.  A
		// high-shield enemy that we keep from reaching it lets us watch the Gunner choose to sit still and shoot.
		const gunner = world.loadEntity({ type: 'gunner', x: 200, y: 200, owner: redStation.eid, ...RED_FACTION });
		world.loadEntity({ type: 'gunner', x: 260, y: 200, owner: blueStation.eid, ...BLUE_FACTION, maxShields: 100, timeToRegenerateShields: 1000 });

		world.update(50);
		world.update(50);

		// It froze rather than closing the last 60px: no velocity, and still sitting where it started.
		expect(speed(gunner.components.velocity!)).toBeLessThan(0.001);
		expect(gunner.components.transform!.x).toBeCloseTo(200, 3);
		expect(gunner.components.transform!.y).toBeCloseTo(200, 3);
	});

	it('closes in on an enemy that is still beyond firing range', async () => {
		world = await loadTwoStations();
		const redStation = entityList(world)[0];
		const blueStation = entityList(world)[1];

		// The enemy is inside the Gunner's 150 search range but past its 120 weapon range (180px below), so the
		// Gunner has a target it cannot yet shoot - and should steer toward it rather than hold.
		const gunner = world.loadEntity({ type: 'gunner', x: 200, y: 200, owner: redStation.eid, ...RED_FACTION });
		world.loadEntity({ type: 'gunner', x: 200, y: 380, owner: blueStation.eid, ...BLUE_FACTION, maxShields: 100, timeToRegenerateShields: 1000 });

		world.update(50);

		// Moving, and toward the enemy below it (gaining +y).
		expect(speed(gunner.components.velocity!)).toBeGreaterThan(1);
		expect(gunner.components.velocity!.velocityY).toBeGreaterThan(0);
	});
});

describe('level bounds', () => {
	it('keeps a ship inside the level and turns it back in when it runs into a wall', async () => {
		world = await loadTwoStations();
		const redStation = entityList(world)[0];

		// A lone ship hard against the right wall, shoved straight at it
		const ship = world.loadEntity({ type: 'gunner', x: 595, y: 300, owner: redStation.eid, ...RED_FACTION });
		ship.components.velocity!.velocityX = 200;
		ship.components.velocity!.velocityY = 0;

		for(let i = 0; i < 10; i++) {
			world.update(50);
		}

		// It never escaped the 600x600 bounds and is now heading back inward.
		const transform = ship.components.transform!;
		expect(transform.x).toBeGreaterThanOrEqual(0);
		expect(transform.x).toBeLessThanOrEqual(600);
		expect(ship.components.velocity!.velocityX).toBeLessThan(0);
	});
});

describe('missile frigate strafe', () => {
	it('slides sideways across its target instead of freezing when in range', async () => {
		world = await loadTwoStations();
		const redStation = entityList(world)[0];
		const blueStation = entityList(world)[1];

		// A Missile Frigate (range 160, so it strafes at up to 160) with an enemy 120px straight below it - in range.
		// A strafer weaves perpendicular to the aim line, so with the target due south its motion is mostly east/west.
		const frigate = world.loadEntity({ type: 'missileFrigate', x: 300, y: 200, owner: redStation.eid, ...RED_FACTION });
		world.loadEntity({ type: 'missileFrigate', x: 300, y: 320, owner: blueStation.eid, ...BLUE_FACTION, maxShields: 100, timeToRegenerateShields: 1000 });

		world.update(50);

		const velocity = frigate.components.velocity!;
		// It is moving (not frozen like a plain gunship) and mostly sideways relative to the target below it.
		expect(speed(velocity)).toBeGreaterThan(1);
		expect(Math.abs(velocity.velocityX)).toBeGreaterThan(Math.abs(velocity.velocityY));
	});
});
