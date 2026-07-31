import type { ComponentSystemWorld, EntityUpdateFunction } from '@daneren2005/shared-memory-ecs';
import { TRANSFORM_X_INDEX, TRANSFORM_Y_INDEX, TRANSFORM_ANGLE_INDEX, VELOCITY_X_INDEX, VELOCITY_Y_INDEX } from '@daneren2005/shared-memory-physics';
import type { Components, ComponentArrays } from '../components';
import computeAngle from '@/math/compute-angle';
import normalize from '@/math/normalize';
import { ATTACK_TARGET, ATTACK_STEER_FORCE, ATTACK_SPEED } from '../components/attack';

interface TargetPosition {
	x: number
	y: number
}
type Scratch = ComponentSystemWorld & {
	positionByEid?: Record<number, TargetPosition>
};

// Steers each ship toward its assigned target by nudging its velocity toward the target and renormalising to
// the ship's top speed, then re-faces it along the new heading.  Target positions are gathered once per run
// via the `targets` query (everything with a transform) so a ship can look up whoever it is chasing.
export const moveToTargetUpdate: EntityUpdateFunction<Components, Pick<ComponentArrays, 'velocity' | 'transform' | 'attack'>> = (world, entityId, components) => {
	const scratch = world as Scratch;
	const velocity = components.velocity;
	const transform = components.transform;
	const attack = components.attack;
	if(!scratch.positionByEid) {
		return;
	}

	const target = attack[ATTACK_TARGET];
	const targetPosition = target ? scratch.positionByEid[target] : undefined;
	if(!targetPosition) {
		return;
	}

	const x = transform[TRANSFORM_X_INDEX];
	const y = transform[TRANSFORM_Y_INDEX];
	const force = normalize(targetPosition.x - x, targetPosition.y - y);

	const speed = attack[ATTACK_SPEED];
	const steerForce = attack[ATTACK_STEER_FORCE];
	const steered = normalize(velocity[VELOCITY_X_INDEX] + force.x * steerForce, velocity[VELOCITY_Y_INDEX] + force.y * steerForce);
	const newVelocityX = steered.x * speed;
	const newVelocityY = steered.y * speed;

	velocity[VELOCITY_X_INDEX] = newVelocityX;
	velocity[VELOCITY_Y_INDEX] = newVelocityY;
	transform[TRANSFORM_ANGLE_INDEX] = computeAngle(newVelocityX, newVelocityY);
};

moveToTargetUpdate.preRun = (world, entities, queries) => {
	const scratch = world as Scratch;
	const positionByEid: Record<number, TargetPosition> = {};
	for(let entity of queries.targets ?? []) {
		const transform = entity.components.transform;
		if(transform) {
			positionByEid[entity.entityId] = { x: transform[TRANSFORM_X_INDEX], y: transform[TRANSFORM_Y_INDEX] };
		}
	}
	scratch.positionByEid = positionByEid;
};
