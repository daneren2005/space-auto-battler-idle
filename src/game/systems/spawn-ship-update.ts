import { createEntityWorker } from '@daneren2005/shared-memory-ecs/worker';
import type { EntityUpdateFunction } from '@daneren2005/shared-memory-ecs';
import { TRANSFORM_X_INDEX, TRANSFORM_Y_INDEX, BODY_CATEGORY_INDEX, BODY_MASK_INDEX } from '@daneren2005/shared-memory-physics';
import type { Components, ComponentArrays } from '../components';
import computeAngle from '@/math/compute-angle';
import { SHIP_TYPES, SHIP_TYPE_INDEX, SHIP_TYPE_DEFS, shieldsForLevel, contactDamageForLevel, weaponDamageForLevel, projectileCountForLevel } from '@/data/ship-types';
import { hangarRateIndex, hangarLevelIndex, hangarProgressIndex } from '../components/hangar';
import { seedRand, type SeededWorld } from './seeded-world';

// A freshly-spawned ship's random initial velocity magnitude, in pixels/second.
const SHIP_SPEED = 100;

// Progress one ship costs. Progress banks as microseconds-of-elapsed x ships/second, so one second at 1/s buys
// one ship. Microseconds (not millis) so rounding a frame's elapsed time can't visibly drift the rate.
const PROGRESS_PER_SHIP = 1_000_000;

// Each run a station banks `elapsed * rate` per production line and launches however many whole ships that buys,
// carrying the fraction over so the average rate holds. Each ship is stamped with its type's level-scaled
// shields/damage. Creation can't happen in a worker, so createEntityWorker buffers the config for next frame.
export const spawnShipUpdate: EntityUpdateFunction<Components, Pick<ComponentArrays, 'hangar' | 'transform' | 'body'>, SeededWorld> = (world, entityId, components, queries, callbacks) => {
	const hangar = components.hangar;
	const transform = components.transform;
	const body = components.body;

	const x = transform[TRANSFORM_X_INDEX];
	const y = transform[TRANSFORM_Y_INDEX];
	// A ship inherits its station's collide category + mask. Read off the live block so a faction changing who
	// it fights hands that down to future ships.
	const collideCategory = body[BODY_CATEGORY_INDEX];
	const collideMask = body[BODY_MASK_INDEX];
	const elapsedMicros = Math.round(world.elapsedTime * 1_000);

	for(const type of SHIP_TYPES) {
		const typeIndex = SHIP_TYPE_INDEX[type];

		// rate is raised by the main thread on a rate upgrade, so read it atomically.
		const rate = Atomics.load(hangar, hangarRateIndex(typeIndex));
		if(rate <= 0) {
			continue;
		}

		// progress is only ever touched here (single writer), so a plain read-modify-write is safe.
		const progressIndex = hangarProgressIndex(typeIndex);
		const progress = hangar[progressIndex] + elapsedMicros * rate;
		const spawning = Math.floor(progress / PROGRESS_PER_SHIP);
		hangar[progressIndex] = progress - spawning * PROGRESS_PER_SHIP;
		if(spawning <= 0) {
			continue;
		}

		// level is written atomically by the main thread on a level upgrade; it scales the stamped stats.
		const level = Atomics.load(hangar, hangarLevelIndex(typeIndex));
		const def = SHIP_TYPE_DEFS[type];
		const maxShields = shieldsForLevel(def, level);
		const contactDamage = contactDamageForLevel(def, level);
		const weaponDamage = def.weapon ? weaponDamageForLevel(def, level) : undefined;
		// Any weapon whose volley (or a Carrier's drone launch) grows with level is stamped its level-scaled count.
		const weaponProjectileCount = def.weapon ? projectileCountForLevel(def, level) : undefined;

		for(let i = 0; i < spawning; i++) {
			// Rolled per ship, so a batch leaves as a spread rather than a convoy.
			const velocityX = (world.rand.next() > 0.5 ? -1 : 1) * world.rand.next() * SHIP_SPEED;
			const velocityY = (world.rand.next() > 0.5 ? -1 : 1) * world.rand.next() * SHIP_SPEED;

			createEntityWorker({
				type,
				x,
				y,
				owner: entityId,
				velocityX,
				velocityY,
				angle: computeAngle(velocityX, velocityY),
				maxShields,
				contactDamage,
				weaponDamage,
				weaponProjectileCount,
				collideCategory,
				collideMask,
			}, callbacks);
		}
	}
};

// Seeds the worker's RNG once from the seed the spawn system sends in its init message.
spawnShipUpdate.init = seedRand;
