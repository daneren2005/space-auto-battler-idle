import { createEntityWorker } from '@daneren2005/shared-memory-ecs';
import type { EntityUpdateFunction } from '@daneren2005/shared-memory-ecs';
import { TRANSFORM_X_INDEX, TRANSFORM_Y_INDEX, BODY_CATEGORY_INDEX, BODY_MASK_INDEX } from '@daneren2005/shared-memory-physics';
import type { Components, ComponentArrays } from '../components';
import computeAngle from '@/math/compute-angle';
import { CONTROLLER_SHIPS_PER_SECOND, CONTROLLER_SHIP_SHIELDS, CONTROLLER_SPAWN_PROGRESS } from '../components/controller';

// Magnitude of a freshly-spawned ship's random initial velocity, in pixels/second.
const SHIP_SPEED = 100;

// How much banked progress one ship costs.  Progress is measured in microseconds-of-elapsed-time multiplied by
// the station's ships/second, so a full second at 1 ship/second - or a hundredth of a second at 100 - buys
// exactly one ship.  Microseconds rather than milliseconds only so that rounding a frame's elapsed time to a
// whole unit stays far below anything that could visibly drift the rate.
const PROGRESS_PER_SHIP = 1_000_000;

// Each run, every station banks the time that has passed against its spawn rate and launches however many whole
// ships that buys, at its position with a random initial heading.  Nothing caps the count: at a high enough rate
// a station spawns several ships a frame, and the leftover fraction of a ship carries over to the next run so
// the average rate holds however the frames fall.  Creation can't happen in a worker (eid allocation + factory
// expansion live on the main thread), so createEntityWorker buffers the flat config and the ships first exist
// next frame.
export const spawnShipUpdate: EntityUpdateFunction<Components, Pick<ComponentArrays, 'controller' | 'transform' | 'body'>> = (world, entityId, components, queries, callbacks) => {
	const controller = components.controller;
	const transform = components.transform;
	const body = components.body;

	// shipsPerSecond is raised by the main thread when the player buys an upgrade, so read it atomically.
	const shipsPerSecond = Atomics.load(controller, CONTROLLER_SHIPS_PER_SECOND);
	if(shipsPerSecond <= 0) {
		return;
	}

	// spawnProgress is only ever touched here - this system is the only writer, on one thread - so a plain
	// read-modify-write is safe, unlike the shared fields above.
	const progress = controller[CONTROLLER_SPAWN_PROGRESS] + Math.round(world.elapsedTime * 1_000) * shipsPerSecond;
	const spawning = Math.floor(progress / PROGRESS_PER_SHIP);
	controller[CONTROLLER_SPAWN_PROGRESS] = progress - spawning * PROGRESS_PER_SHIP;
	if(spawning <= 0) {
		return;
	}

	// Ships spawn with as many shields as this faction has bought (main thread writes it atomically on a
	// shield upgrade); maxShields sets the current shields too (see health load).
	const shipShields = Atomics.load(controller, CONTROLLER_SHIP_SHIELDS);

	for(let i = 0; i < spawning; i++) {
		// Rolled per ship, so a batch leaves the station as a spread rather than as one stack flying in convoy.
		const velocityX = (Math.random() > 0.5 ? -1 : 1) * Math.random() * SHIP_SPEED;
		const velocityY = (Math.random() > 0.5 ? -1 : 1) * Math.random() * SHIP_SPEED;

		createEntityWorker({
			type: 'ship',
			x: transform[TRANSFORM_X_INDEX],
			y: transform[TRANSFORM_Y_INDEX],
			owner: entityId,
			velocityX,
			velocityY,
			angle: computeAngle(velocityX, velocityY),
			maxShields: shipShields,
			// A ship fights for its station, so it collides as that station's faction and with whatever the station
			// collides with - which is everything but its own faction.  Read off the live block rather than a config so
			// a faction that changes who it fights hands that down to the ships it spawns from then on.
			collideCategory: body[BODY_CATEGORY_INDEX],
			collideMask: body[BODY_MASK_INDEX],
		}, callbacks);
	}
};
