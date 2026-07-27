import { createEntityWorker } from '@daneren2005/shared-memory-ecs';
import type { EntityUpdateFunction } from '@daneren2005/shared-memory-ecs';
import type { Components, ComponentArrays } from '../components';
import computeAngle from '@/math/compute-angle';
import { POSITION_X, POSITION_Y } from '../components/position';
import { CONTROLLER_OPEN_SHIPS, CONTROLLER_SHIP_SHIELDS } from '../components/controller';

// Magnitude of a freshly-spawned ship's random initial velocity, in pixels/second.
const SHIP_SPEED = 100;

// Each run, every station holding money spends one and asks the main thread to create a ship at its position
// with a random initial heading.  Creation can't happen in a worker (eid allocation + factory expansion live
// on the main thread), so createEntityWorker buffers the flat config and the ship first exists next frame.
export const spawnShipUpdate: EntityUpdateFunction<Components, Pick<ComponentArrays, 'controller' | 'position'>> = (world, entityId, components, queries, callbacks) => {
	// controller is an Int32Array block; openShips is banked/spent by this system and by collisionUpdate on
	// other worker threads at the same time, so every read-modify-write of it has to go through Atomics.
	const controller = components.controller;
	const position = components.position;
	if(Atomics.load(controller, CONTROLLER_OPEN_SHIPS) <= 0) {
		return;
	}

	const velocityX = (Math.random() > 0.5 ? -1 : 1) * Math.random() * SHIP_SPEED;
	const velocityY = (Math.random() > 0.5 ? -1 : 1) * Math.random() * SHIP_SPEED;

	// Ships spawn with as many shields as this faction has bought (main thread writes it atomically on a
	// shield upgrade); maxShields sets the current shields too (see health load).
	const shipShields = Atomics.load(controller, CONTROLLER_SHIP_SHIELDS);

	createEntityWorker({
		type: 'ship',
		x: position[POSITION_X],
		y: position[POSITION_Y],
		owner: entityId,
		velocityX,
		velocityY,
		angle: computeAngle(velocityX, velocityY),
		maxShields: shipShields,
	}, callbacks);

	Atomics.sub(controller, CONTROLLER_OPEN_SHIPS, 1);
};
