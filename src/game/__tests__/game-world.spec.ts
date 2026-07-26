import { describe, it, expect, afterEach } from 'vitest';
import GameWorld from '../entities/game-world';

// Two distinct station colours.  Ships inherit their owning station's colour, and only different-coloured
// entities count as enemies (collisions + targeting), so these pick who fights whom.
const RED = 0xff0000;
const BLUE = 0x0000ff;

// spawnShipUpdate caps a fresh ship's per-axis velocity at this magnitude (px/second).
const SHIP_SPEED = 100;

let world: GameWorld | undefined;
afterEach(() => {
	// Tear the world down so its Web Workers are terminated between tests.
	world?.destroy();
	world = undefined;
});

// Advance the world by one frame (`dt` seconds) and wait for the off-thread work it kicked off to land.
//
// The systems run on real Web Workers (via @vitest/web-worker), so `world.update()` only *posts* work - the
// spawns, collisions, deaths and money transfers all resolve later when each worker replies.  world.update
// emits `system-<name>-finished` synchronously with whether that system ran this frame, and every system that
// ran later emits `system-<name>-worker-events-finished` once its reply has been fully applied.  We count the
// former and wait for that many of the latter, which mirrors exactly how the game ticks - we just block until
// the frame has fully settled before asserting or stepping again.
function runFrame(gameWorld: GameWorld, dt: number): Promise<void> {
	let expected = 0;
	let completed = 0;
	let settle: (() => void) | undefined;
	const settled = new Promise<void>(resolve => {
		settle = resolve;
	});

	const workerHandlers = gameWorld.systems.map(system => {
		const event = `system-${system.name}-worker-events-finished`;
		const handler = () => {
			completed++;
			if(completed >= expected) {
				settle?.();
			}
		};
		gameWorld.on(event, handler);
		return { event, handler };
	});
	const ranHandlers = gameWorld.systems.map(system => {
		const event = `system-${system.name}-finished`;
		const handler = (result: { ran: boolean }) => {
			if(result.ran) {
				expected++;
			}
		};
		gameWorld.once(event, handler);
		return { event, handler };
	});

	gameWorld.update(dt);

	// Nothing posted any off-thread work this frame, so there is nothing to wait for.
	if(expected === 0) {
		settle?.();
	}

	return settled.finally(() => {
		workerHandlers.forEach(({ event, handler }) => gameWorld.off(event, handler));
		ranHandlers.forEach(({ event, handler }) => gameWorld.off(event, handler));
	});
}

// Every ship (controlled) and station (controller) stays on screen.
function everyEntityWithinBounds(gameWorld: GameWorld, tolerance: number): boolean {
	return gameWorld.entities.every(entity => {
		const position = entity.components.position;
		if(!position) {
			return true;
		}
		return position.x >= -tolerance && position.x <= gameWorld.bounds.width + tolerance
			&& position.y >= -tolerance && position.y <= gameWorld.bounds.height + tolerance;
	});
}

describe('GameWorld game loop', () => {
	it('keeps every ship inside the map, bouncing off the walls, over a minute of play', async () => {
		const bounds = { width: 400, height: 400 };
		world = new GameWorld();
		world.load({
			bounds,
			// A single station: with no enemy colour anywhere, its ships never chase a target, so they simply
			// drift on their spawn velocity and can only ever bounce off the walls.
			entities: [
				{ type: 'station', color: RED, money: 20, x: 200, y: 200 },
			],
		});
		await world.init();

		const dt = 0.25;
		const frames = Math.round(60 / dt);
		for(let i = 0; i < frames; i++) {
			await runFrame(world, dt);
		}

		// The station banked 20 money and spends one per frame, so all 20 ships spawned; a single-colour map has
		// no collisions, so none of them died.
		const ships = world.entities.filter(entity => !!entity.components.controlled);
		expect(ships.length).toBe(20);

		// A ship can only ever overshoot a wall by a single frame of travel before the bounce turns it around.
		// If bouncing were broken it would fly off unbounded (>6000px over a minute), so this tolerance cleanly
		// separates "bounced" from "escaped".
		const tolerance = SHIP_SPEED * dt + 1;
		expect(everyEntityWithinBounds(world, tolerance)).toBe(true);
	}, 60000);

	it('destroys both ships and pays each owning station when evenly matched enemies collide', async () => {
		world = new GameWorld();
		world.load({
			bounds: { width: 400, height: 400 },
			entities: [
				{ type: 'station', color: RED, money: 0, x: 20, y: 20 },
				{ type: 'station', color: BLUE, money: 0, x: 380, y: 380 },
			],
		});
		await world.init();

		const redStation = world.entities[0];
		const blueStation = world.entities[1];

		// Two enemy ships dropped on the exact same spot: overlapping + different colours means they collide
		// every eligible frame, and since each is the other's nearest target the steering resolves to a zero
		// nudge - so they sit still and keep trading blows.  timeToRegenerateShields is pushed far out so shields
		// can't tick back up and stall the fight.
		const red = world.loadEntity({ type: 'ship', x: 200, y: 200, owner: redStation.eid, timeToRegenerateShields: 1000 });
		const blue = world.loadEntity({ type: 'ship', x: 200, y: 200, owner: blueStation.eid, timeToRegenerateShields: 1000 });
		const redEid = red.eid;
		const blueEid = blue.eid;

		// dt sits above the 0.2s damage cooldown so a hit lands on every eligible frame.  Both ships have one
		// shield, so the first exchange drops them to zero and the second is mutually fatal.
		for(let i = 0; i < 40 && (world.getEntityByEid(redEid) || world.getEntityByEid(blueEid)); i++) {
			await runFrame(world, 0.25);
		}

		expect(world.getEntityByEid(redEid)).toBeUndefined();
		expect(world.getEntityByEid(blueEid)).toBeUndefined();
		// Each ship landed a killing blow on the other, so each station banked a single-ship bounty.
		expect(redStation.components.controller!.money).toBe(1);
		expect(blueStation.components.controller!.money).toBe(1);
	}, 20000);

	it('pays only the winning station when a stronger ship outlasts a weaker enemy', async () => {
		world = new GameWorld();
		world.load({
			bounds: { width: 400, height: 400 },
			entities: [
				{ type: 'station', color: RED, money: 0, x: 20, y: 20 },
				{ type: 'station', color: BLUE, money: 0, x: 380, y: 380 },
			],
		});
		await world.init();

		const redStation = world.entities[0];
		const blueStation = world.entities[1];

		// Same overlapping stand-off, but the red ship carries three shields to the blue ship's one, so red
		// survives the exchange and blue is destroyed.
		const red = world.loadEntity({ type: 'ship', x: 200, y: 200, owner: redStation.eid, maxShields: 3, timeToRegenerateShields: 1000 });
		const blue = world.loadEntity({ type: 'ship', x: 200, y: 200, owner: blueStation.eid, maxShields: 1, timeToRegenerateShields: 1000 });
		const redEid = red.eid;
		const blueEid = blue.eid;

		for(let i = 0; i < 40 && world.getEntityByEid(blueEid); i++) {
			await runFrame(world, 0.25);
		}

		const survivor = world.getEntityByEid(redEid);
		expect(world.getEntityByEid(blueEid)).toBeUndefined();
		expect(survivor).toBeDefined();
		// The winner's station collected the bounty for the kill; the loser's station got nothing.
		expect(redStation.components.controller!.money).toBe(1);
		expect(blueStation.components.controller!.money).toBe(0);
		// Red traded two of its three shields (one per exchange) to land the kill.
		expect(survivor!.components.health!.shields).toBe(1);
	}, 20000);
});
