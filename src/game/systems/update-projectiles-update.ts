import { killEntityWorker } from '@daneren2005/shared-memory-ecs/worker';
import type { EntityWorkerSystemWorld, EntityUpdateFunction } from '@daneren2005/shared-memory-ecs';
import { TRANSFORM_X_INDEX, TRANSFORM_Y_INDEX, TRANSFORM_ANGLE_INDEX, VELOCITY_X_INDEX, VELOCITY_Y_INDEX } from '@daneren2005/shared-memory-physics';
import type { Components, ComponentArrays } from '../components';
import computeAngle from '@/math/compute-angle';
import normalize from '@/math/normalize';
import { PROJECTILE_REMAINING_LIFETIME, PROJECTILE_TARGET, PROJECTILE_TURN } from '../components/projectile';

// `entity` is what killEntityWorker needs to flag a shot dead; typed by hand since it's not in this registry.
type ProjectileUpdateComponents = Pick<ComponentArrays, 'projectile' | 'transform' | 'velocity'> & {
	entity?: Uint32Array
};

interface TargetPosition {
	x: number
	y: number
}
type Scratch = EntityWorkerSystemWorld & {
	positionByEid?: Record<number, TargetPosition>
};

// One pass per live projectile: count its lifetime down and kill it when it runs out, and - for a homing shot -
// steer it toward its target (like move-to-target). A straight shot, or one whose target has died, coasts.
export const updateProjectilesUpdate: EntityUpdateFunction<Components, ProjectileUpdateComponents> = (world, entityId, components, queries, callbacks) => {
	const projectile = components.projectile;

	// Lifetime is in seconds; the world runs in milliseconds.
	const remaining = projectile[PROJECTILE_REMAINING_LIFETIME] - world.elapsedTime / 1_000;
	if(remaining <= 0) {
		const entity = components.entity;
		if(entity) {
			killEntityWorker(entityId, { entity }, callbacks);
		}
		return;
	}
	projectile[PROJECTILE_REMAINING_LIFETIME] = remaining;

	const target = projectile[PROJECTILE_TARGET];
	const turn = projectile[PROJECTILE_TURN];
	if(!target || turn <= 0) {
		return;
	}
	const scratch = world as Scratch;
	const targetPosition = scratch.positionByEid?.[target];
	if(!targetPosition) {
		return;
	}

	const transform = components.transform;
	const velocity = components.velocity;
	const vx = velocity[VELOCITY_X_INDEX];
	const vy = velocity[VELOCITY_Y_INDEX];
	const speed = Math.sqrt(vx * vx + vy * vy);
	if(speed === 0) {
		return;
	}

	const force = normalize(targetPosition.x - transform[TRANSFORM_X_INDEX], targetPosition.y - transform[TRANSFORM_Y_INDEX]);
	const steered = normalize(vx + force.x * turn, vy + force.y * turn);
	const newVelocityX = steered.x * speed;
	const newVelocityY = steered.y * speed;
	velocity[VELOCITY_X_INDEX] = newVelocityX;
	velocity[VELOCITY_Y_INDEX] = newVelocityY;
	transform[TRANSFORM_ANGLE_INDEX] = computeAngle(newVelocityX, newVelocityY);
};

// Gather every target's position once per run, so a homing shot can look up its target.
updateProjectilesUpdate.preRun = (world, entities, queries) => {
	const scratch = world as Scratch;
	const positionByEid: Record<number, TargetPosition> = {};
	for(const entity of queries.targets ?? []) {
		const transform = entity.components.transform;
		if(transform) {
			positionByEid[entity.entityId] = { x: transform[TRANSFORM_X_INDEX], y: transform[TRANSFORM_Y_INDEX] };
		}
	}
	scratch.positionByEid = positionByEid;
};
