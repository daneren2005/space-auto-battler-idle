import { describe, it, expect, afterEach } from 'vitest';
import GameWorld from '../entities/game-world';
import entityList from '../entities/entity-list';
import { factionCollision } from '@/data/collide-categories';

// Same two-faction setup the game-world tests use: colour decides who targets whom, the collide category decides
// who actually collides.  A projectile inherits its firing ship's category + mask, so a red ship's shots hit blue
// and pass through red.
const RED = 0xff0000;
const BLUE = 0x0000ff;
const RED_FACTION = factionCollision(0);
const BLUE_FACTION = factionCollision(1);

let world: GameWorld | undefined;
afterEach(() => {
	world?.destroy();
	world = undefined;
});

// Every live projectile in the world.
function projectiles(gameWorld: GameWorld) {
	return entityList(gameWorld).filter(entity => !!entity.components.projectile);
}

// Two stations, one of each colour, neither spawning on its own - so the only entities are the ones a test adds.
async function loadTwoStations(): Promise<GameWorld> {
	const gameWorld = new GameWorld();
	gameWorld.load({
		bounds: { width: 400, height: 400 },
		entities: [
			{ type: 'station', color: RED, ...RED_FACTION, x: 20, y: 20 },
			{ type: 'station', color: BLUE, ...BLUE_FACTION, x: 380, y: 380 },
		],
	});
	await gameWorld.init();

	return gameWorld;
}

describe('weapon firing', () => {
	it('fires a projectile at an enemy within weapon range', async () => {
		world = await loadTwoStations();
		const redStation = entityList(world)[0];
		const blueStation = entityList(world)[1];

		// An armed red ship with a blue enemy 60px away - inside both the search range and the weapon's range.  It
		// deals no contact damage, so the only thing it can do to the enemy is shoot it.
		world.loadEntity({
			type: 'skiff', x: 200, y: 200, owner: redStation.eid, ...RED_FACTION, contactDamage: 0, maxShields: 10, timeToRegenerateShields: 1000,
			weapon: { range: 150, fireInterval: 0.5, projectileSpeed: 260, damage: 1 },
		});
		world.loadEntity({ type: 'skiff', x: 260, y: 200, owner: blueStation.eid, ...BLUE_FACTION, contactDamage: 0, maxShields: 10, timeToRegenerateShields: 1000 });

		// A weapon starts ready, so it fires on the first frame it has a target in range.
		world.update(50);

		expect(projectiles(world).length).toBe(1);
	});

	it('holds fire when the only enemy is beyond weapon range', async () => {
		world = await loadTwoStations();
		const redStation = entityList(world)[0];
		const blueStation = entityList(world)[1];

		// The enemy is close enough to be targeted (search range 150) but past this weapon's short 100 range, so the
		// ship acquires it yet cannot shoot it - and barely moves in a single 50ms frame, so it stays out of range.
		world.loadEntity({
			type: 'skiff', x: 200, y: 200, owner: redStation.eid, ...RED_FACTION, contactDamage: 0, maxShields: 10, timeToRegenerateShields: 1000,
			weapon: { range: 100, fireInterval: 0.5, projectileSpeed: 260, damage: 1 },
		});
		world.loadEntity({ type: 'skiff', x: 340, y: 200, owner: blueStation.eid, ...BLUE_FACTION, contactDamage: 0, maxShields: 10, timeToRegenerateShields: 1000 });

		world.update(50);

		expect(projectiles(world).length).toBe(0);
	});
});

describe('projectile impact', () => {
	it('damages the enemy it hits, is consumed, and pays the owning station', async () => {
		world = await loadTwoStations();
		const redStation = entityList(world)[0];
		const blueStation = entityList(world)[1];

		// A blue enemy ship with a single shield, and a red-owned shot placed right on top of it dealing three.  The
		// frame is longer than the damage cooldown so the hit lands this frame; the shot passing through (a sensor)
		// rather than bouncing is what lets it sit on the target and connect.
		const blue = world.loadEntity({ type: 'skiff', x: 200, y: 200, owner: blueStation.eid, ...BLUE_FACTION, contactDamage: 0, maxShields: 1, timeToRegenerateShields: 1000 });
		const projectile = world.loadEntity({ type: 'projectile', x: 200, y: 200, owner: redStation.eid, ...RED_FACTION, contactDamage: 3 });
		const blueEid = blue.eid;
		const projectileEid = projectile.eid;

		world.update(250);

		expect(world.getEntityByEid(blueEid)).toBeUndefined();
		// The shot is spent on impact rather than flying on through.
		expect(world.getEntityByEid(projectileEid)).toBeUndefined();
		// A ship is worth one to whoever killed it, credited to the shot's owning faction.
		expect(redStation.components.controller!.money).toBe(1);
	});

	it('expires on its own once its lifetime runs out', async () => {
		world = new GameWorld();
		world.load({
			bounds: { width: 400, height: 400 },
			entities: [
				{ type: 'station', color: RED, ...RED_FACTION, x: 20, y: 20 },
			],
		});
		await world.init();

		const redStation = entityList(world)[0];
		// Nothing to hit (its own faction passes through the station), and a lifetime shorter than the frame - so the
		// only thing that can happen to it is timing out.
		const projectile = world.loadEntity({ type: 'projectile', x: 200, y: 200, owner: redStation.eid, ...RED_FACTION, velocityX: 0, velocityY: 0, remainingLifetime: 0.05 });
		const projectileEid = projectile.eid;

		world.update(100);

		expect(world.getEntityByEid(projectileEid)).toBeUndefined();
	});

	it('steers a homing shot toward its target', async () => {
		world = await loadTwoStations();
		const redStation = entityList(world)[0];
		const blueStation = entityList(world)[1];
		// Move the blue station directly below where the shot starts, so "turning toward it" means gaining +y velocity.
		blueStation.components.transform!.x = 200;
		blueStation.components.transform!.y = 300;

		// A red homing shot flying straight along +x, locked onto the station below it: guidance should bend its
		// heading downward, so its y velocity climbs off zero.
		const projectile = world.loadEntity({
			type: 'projectile', x: 200, y: 200, owner: redStation.eid, ...RED_FACTION,
			velocityX: 200, velocityY: 0, remainingLifetime: 5, target: blueStation.eid, turn: 30,
		});
		const projectileEid = projectile.eid;

		world.update(50);
		world.update(50);

		const homing = world.getEntityByEid(projectileEid);
		expect(homing).toBeDefined();
		expect(homing!.components.velocity!.velocityY).toBeGreaterThan(0);
	});
});
