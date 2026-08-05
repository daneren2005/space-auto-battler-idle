import { createEntityWorker } from '@daneren2005/shared-memory-ecs/worker';
import type { EntityUpdateFunction } from '@daneren2005/shared-memory-ecs';
import { TRANSFORM_X_INDEX, TRANSFORM_Y_INDEX, BODY_CATEGORY_INDEX, BODY_MASK_INDEX } from '@daneren2005/shared-memory-physics';
import type { Components, ComponentArrays } from '../components';
import computeAngle from '@/math/compute-angle';
import { SHIP_TYPES, SHIP_TYPE_INDEX, SHIP_TYPE_DEFS, shieldsForLevel, contactDamageForLevel, weaponDamageForLevel, droneCountForLevel } from '@/data/ship-types';
import { hangarRateIndex, hangarLevelIndex, hangarProgressIndex } from '../components/hangar';

// Magnitude of a freshly-spawned ship's random initial velocity, in pixels/second.
const SHIP_SPEED = 100;

// How much banked progress one ship costs.  Progress is measured in microseconds-of-elapsed-time multiplied by
// the station's ships/second, so a full second at 1 ship/second - or a hundredth of a second at 100 - buys
// exactly one ship.  Microseconds rather than milliseconds only so that rounding a frame's elapsed time to a
// whole unit stays far below anything that could visibly drift the rate.
const PROGRESS_PER_SHIP = 1_000_000;

// Each run, every station works its way down its hangar's production lines - one per ship type it builds - and
// launches whatever each line's rate has earned this frame.  A line banks `elapsed * rate` and spawns however
// many whole ships that buys, at the station's position with a random initial heading; the leftover fraction
// carries over so the average rate holds however the frames fall, and each line banks independently of the rest.
// Every ship a line launches is stamped with the shields and damage its type has at the line's current upgrade
// level.  Nothing caps the count: at a high enough rate a line spawns several ships a frame.  Creation can't
// happen in a worker (eid allocation + factory expansion live on the main thread), so createEntityWorker buffers
// the flat config and the ships first exist next frame.
export const spawnShipUpdate: EntityUpdateFunction<Components, Pick<ComponentArrays, 'hangar' | 'transform' | 'body'>> = (world, entityId, components, queries, callbacks) => {
	const hangar = components.hangar;
	const transform = components.transform;
	const body = components.body;

	const x = transform[TRANSFORM_X_INDEX];
	const y = transform[TRANSFORM_Y_INDEX];
	// A ship fights for its station, so it collides as that station's faction and with whatever the station
	// collides with - which is everything but its own faction.  Read off the live block rather than a config so a
	// faction that changes who it fights hands that down to the ships it spawns from then on.
	const collideCategory = body[BODY_CATEGORY_INDEX];
	const collideMask = body[BODY_MASK_INDEX];
	const elapsedMicros = Math.round(world.elapsedTime * 1_000);

	for(const type of SHIP_TYPES) {
		const typeIndex = SHIP_TYPE_INDEX[type];

		// rate is raised by the main thread when the player buys a rate upgrade, so read it atomically.
		const rate = Atomics.load(hangar, hangarRateIndex(typeIndex));
		if(rate <= 0) {
			continue;
		}

		// progress is only ever touched here - this system is the only writer, on one thread - so a plain
		// read-modify-write is safe, unlike the shared rate/level above.
		const progressIndex = hangarProgressIndex(typeIndex);
		const progress = hangar[progressIndex] + elapsedMicros * rate;
		const spawning = Math.floor(progress / PROGRESS_PER_SHIP);
		hangar[progressIndex] = progress - spawning * PROGRESS_PER_SHIP;
		if(spawning <= 0) {
			continue;
		}

		// Every ship of this line spawns with the shields + damage its type has at the line's current level (main
		// thread writes it atomically on a level upgrade).  maxShields sets the current shields too (see health).
		const level = Atomics.load(hangar, hangarLevelIndex(typeIndex));
		const def = SHIP_TYPE_DEFS[type];
		const maxShields = shieldsForLevel(def, level);
		const contactDamage = contactDamageForLevel(def, level);
		// An armed type has its per-shot weapon damage stamped from the same level curve; a rammer leaves it unset.
		const weaponDamage = def.weapon ? weaponDamageForLevel(def, level) : undefined;
		// A drone-spawner (the Carrier) has its volley's drone count stamped from the level curve too, so a levelled
		// station launches the bigger swarm; every other type keeps its fixed shot count.
		const weaponProjectileCount = def.weapon?.spawnsDrones ? droneCountForLevel(def, level) : undefined;

		for(let i = 0; i < spawning; i++) {
			// Rolled per ship, so a batch leaves the station as a spread rather than as one stack flying in convoy.
			const velocityX = (Math.random() > 0.5 ? -1 : 1) * Math.random() * SHIP_SPEED;
			const velocityY = (Math.random() > 0.5 ? -1 : 1) * Math.random() * SHIP_SPEED;

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
