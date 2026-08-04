import { describe, it, expect, afterEach } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import GameWorld from '../entities/game-world';
import entityList from '../entities/entity-list';
import { factionCollision } from '@/data/collide-categories';
import {
	SHIP_TYPES, SHIP_TYPE_DEFS, isShipType,
	shieldsForLevel, contactDamageForLevel, weaponDamageForLevel,
} from '@/data/ship-types';
import { makeShipConfig } from '@/data/entities/ship';

const RED = 0xff0000;
const BLUE = 0x0000ff;
const RED_FACTION = factionCollision(0);
const BLUE_FACTION = factionCollision(1);

let world: GameWorld | undefined;
afterEach(() => {
	world?.destroy();
	world = undefined;
});

// Two stations, one of each colour, neither spawning on its own - the only entities are the ones a test places.
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

// Every entity of a given hull width - i.e. every ship of one type (drones and projectiles have their own widths).
function entitiesOfWidth(gameWorld: GameWorld, width: number) {
	return entityList(gameWorld).filter(entity => {
		const transform = entity.components.transform;
		return !!transform && Math.round(transform.width) === width;
	});
}

describe('ship roster defs', () => {
	it('gives every ship type a valid, monotonic def', () => {
		for(const type of SHIP_TYPES) {
			const def = SHIP_TYPE_DEFS[type];

			expect(def.name.length, `${type} name`).toBeGreaterThan(0);
			// Every type names a silhouette under public/ so GameScene can load + tint it (see the art test below).
			expect(def.sprite, `${type} sprite`).toMatch(/^ships\/.+\.png$/);
			expect(def.width, `${type} width`).toBeGreaterThan(0);
			expect(def.height, `${type} height`).toBeGreaterThan(0);
			expect(def.speed, `${type} speed`).toBeGreaterThan(0);
			expect(def.steerForce, `${type} steerForce`).toBeGreaterThan(0);
			expect(def.baseShields, `${type} baseShields`).toBeGreaterThanOrEqual(0);
			expect(def.contactDamage, `${type} contactDamage`).toBeGreaterThanOrEqual(0);

			// Upgrade economy is sane: costs are positive and grow, so an upgrade never gets cheaper.
			expect(def.unlockCost, `${type} unlockCost`).toBeGreaterThanOrEqual(0);
			expect(def.rateCostBase, `${type} rateCostBase`).toBeGreaterThan(0);
			expect(def.rateCostGrowth, `${type} rateCostGrowth`).toBeGreaterThan(1);
			expect(def.levelCostBase, `${type} levelCostBase`).toBeGreaterThan(0);
			expect(def.levelCostGrowth, `${type} levelCostGrowth`).toBeGreaterThan(1);

			// Level scaling never runs backwards: more level is never fewer shields or less damage.
			for(let level = 1; level < 12; level++) {
				expect(shieldsForLevel(def, level + 1), `${type} shields ${level}`).toBeGreaterThanOrEqual(shieldsForLevel(def, level));
				expect(contactDamageForLevel(def, level + 1), `${type} contact ${level}`).toBeGreaterThanOrEqual(contactDamageForLevel(def, level));
				expect(weaponDamageForLevel(def, level + 1), `${type} weapon ${level}`).toBeGreaterThanOrEqual(weaponDamageForLevel(def, level));
			}

			// A weapon, where present, is fully specified so the firing system can act on it.
			if(def.weapon) {
				expect(def.weapon.range, `${type} weapon range`).toBeGreaterThan(0);
				expect(def.weapon.fireInterval, `${type} fireInterval`).toBeGreaterThan(0);
				expect(def.weapon.projectileSpeed, `${type} projectileSpeed`).toBeGreaterThan(0);
				// makeShipConfig turns the def's weapon into a loadable weapon block.
				expect(makeShipConfig(type).weapon, `${type} template weapon`).toBeDefined();
			}
		}
	});

	it('ships a silhouette file for every ship type, and only for ship types', () => {
		const publicDir = fileURLToPath(new URL('../../../public/', import.meta.url));
		for(const type of SHIP_TYPES) {
			const file = resolve(publicDir, SHIP_TYPE_DEFS[type].sprite);
			expect(existsSync(file), `${type} silhouette (${file})`).toBe(true);
			// The scene selects a ship's texture by its type, so the type must read back as a ship type.
			expect(isShipType(type), `${type} isShipType`).toBe(true);
		}
		// A station / drone / projectile is not a ship type, so dressSprite falls back to the boid hull for them.
		expect(isShipType('station')).toBe(false);
		expect(isShipType('drone')).toBe(false);
		expect(isShipType('projectile')).toBe(false);
	});

	it('scales weapon damage with level on the same cadence as contact damage', () => {
		// The Railgun deals 6 per shot at level 1 and gains one every four levels (the default cadence).
		const railgun = SHIP_TYPE_DEFS.railgunLancer;
		expect(weaponDamageForLevel(railgun, 1)).toBe(6);
		expect(weaponDamageForLevel(railgun, 4)).toBe(6);
		expect(weaponDamageForLevel(railgun, 5)).toBe(7);
		expect(weaponDamageForLevel(railgun, 9)).toBe(8);
		// A rammer has no weapon damage to scale.
		expect(weaponDamageForLevel(SHIP_TYPE_DEFS.skiff, 5)).toBe(0);
	});
});

describe('Railgun Lancer long-range acquisition', () => {
	it('acquires and fires on an enemy well beyond the default search range', async () => {
		world = await loadTwoStations();
		const redStation = entityList(world)[0];
		const blueStation = entityList(world)[1];

		// The enemy is 180px away - past the 150 range a normal ship searches, but inside the Railgun's own reach,
		// which follows its 260 weapon range.  A ship that could not see this far could neither target nor shoot it.
		const railgun = world.loadEntity({ type: 'railgunLancer', x: 200, y: 200, owner: redStation.eid, ...RED_FACTION });
		const enemy = world.loadEntity({ type: 'skiff', x: 200, y: 380, owner: blueStation.eid, ...BLUE_FACTION, maxShields: 10, timeToRegenerateShields: 1000 });

		world.update(50);

		expect(railgun.components.attack!.target).toBe(enemy.eid);
		expect(entityList(world).filter(entity => !!entity.components.projectile)).toHaveLength(1);
	});
});

describe('Detonator contact detonation', () => {
	it('destroys every enemy inside its blast radius and is itself consumed', async () => {
		world = await loadTwoStations();
		const redStation = entityList(world)[0];
		const blueStation = entityList(world)[1];

		// A red Detonator sat on a cluster of one-shield blue ships.  Its blast radius is 40 and it deals 4, so the
		// three ships within reach are destroyed; a fourth parked 100px away is well outside the blast and survives.
		const detonator = world.loadEntity({ type: 'detonator', x: 200, y: 200, owner: redStation.eid, ...RED_FACTION });
		const near = [
			world.loadEntity({ type: 'skiff', x: 200, y: 200, owner: blueStation.eid, ...BLUE_FACTION, contactDamage: 0, maxShields: 1, timeToRegenerateShields: 1000 }),
			world.loadEntity({ type: 'skiff', x: 215, y: 200, owner: blueStation.eid, ...BLUE_FACTION, contactDamage: 0, maxShields: 1, timeToRegenerateShields: 1000 }),
			world.loadEntity({ type: 'skiff', x: 232, y: 200, owner: blueStation.eid, ...BLUE_FACTION, contactDamage: 0, maxShields: 1, timeToRegenerateShields: 1000 }),
		];
		const far = world.loadEntity({ type: 'skiff', x: 200, y: 300, owner: blueStation.eid, ...BLUE_FACTION, contactDamage: 0, maxShields: 1, timeToRegenerateShields: 1000 });
		const detonatorEid = detonator.eid;
		const nearEids = near.map(ship => ship.eid);
		const farEid = far.eid;

		// One frame longer than the damage cooldown, so the blast lands the moment the bodies overlap.
		world.update(250);

		expect(world.getEntityByEid(detonatorEid)).toBeUndefined();
		for(const eid of nearEids) {
			expect(world.getEntityByEid(eid)).toBeUndefined();
		}
		expect(world.getEntityByEid(farEid)).toBeDefined();
		// Three ships killed by the blast, all credited to the Detonator's faction.
		expect(redStation.components.controller!.money).toBe(3);
	});
});

describe('Carrier drone spawning', () => {
	it('launches drone sub-ships at an enemy in range instead of firing projectiles', async () => {
		world = await loadTwoStations();
		const redStation = entityList(world)[0];
		const blueStation = entityList(world)[1];

		// A red Carrier with a blue enemy 60px away - inside its 220 range.  Its weapon launches two drones per
		// volley rather than projectiles; a fresh weapon fires the moment it has a target, so the drones appear at once.
		world.loadEntity({ type: 'carrier', x: 200, y: 200, owner: redStation.eid, ...RED_FACTION });
		world.loadEntity({ type: 'skiff', x: 200, y: 260, owner: blueStation.eid, ...BLUE_FACTION, maxShields: 10, timeToRegenerateShields: 1000 });

		world.update(50);

		// Drones are the only width-6 hull in play, and there is no projectile - the Carrier fields ships, not shots.
		expect(entitiesOfWidth(world, 6)).toHaveLength(2);
		expect(entityList(world).filter(entity => !!entity.components.projectile)).toHaveLength(0);
	});
});
