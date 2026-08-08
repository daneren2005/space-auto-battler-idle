import { describe, it, expect, afterEach } from 'vitest';
import GameWorld from '../entities/game-world';
import entityList from '../entities/entity-list';
import { factionCollision } from '@/data/collide-categories';
import type { HangarConfig } from '../components/hangar';

// One faction so nothing collides: every spawned ship survives, and each ship's launch velocity + position is
// driven only by the seeded RNG, which is exactly what we compare across runs.
const RED = 0xff0000;
const RED_FACTION = factionCollision(0);

const worlds: Array<GameWorld> = [];
afterEach(() => {
	worlds.forEach(world => world.destroy());
	worlds.length = 0;
});

async function runStation(seed: number, ships: HangarConfig['ships'], steps: number): Promise<GameWorld> {
	const world = new GameWorld(seed);
	worlds.push(world);
	world.load({
		bounds: { width: 400, height: 400 },
		entities: [
			{ type: 'station', color: RED, ...RED_FACTION, x: 200, y: 200, ships },
		],
	});
	await world.init();

	for(let i = 0; i < steps; i++) {
		world.update(100);
	}

	return world;
}

// Each ship's position in insertion order: seeded launch velocities plus deterministic physics make this a
// fingerprint of the run.
function shipPositions(world: GameWorld): Array<{ x: number, y: number }> {
	return entityList(world)
		.filter(entity => !!entity.components.controlled && !entity.components.projectile && !!entity.components.transform)
		.map(entity => ({ x: entity.components.transform!.x, y: entity.components.transform!.y }));
}

describe('deterministic runs', () => {
	it('replays identically for the same seed', async () => {
		const first = await runStation(42, { skiff: { rate: 4, level: 1 } }, 10);
		const second = await runStation(42, { skiff: { rate: 4, level: 1 } }, 10);

		const positions = shipPositions(first);
		expect(positions.length).toBeGreaterThan(0);
		expect(shipPositions(second)).toEqual(positions);
	});

	it('diverges for different seeds', async () => {
		const first = await runStation(1, { skiff: { rate: 4, level: 1 } }, 10);
		const second = await runStation(2, { skiff: { rate: 4, level: 1 } }, 10);

		expect(shipPositions(second)).not.toEqual(shipPositions(first));
	});
});
