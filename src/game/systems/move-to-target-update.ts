import type { ComponentSystemWorld, EntityUpdateFunction } from '@daneren2005/shared-memory-ecs';
import { TRANSFORM_X_INDEX, TRANSFORM_Y_INDEX, TRANSFORM_ANGLE_INDEX, VELOCITY_X_INDEX, VELOCITY_Y_INDEX } from '@daneren2005/shared-memory-physics';
import type { Components, ComponentArrays } from '../components';
import computeAngle from '@/math/compute-angle';
import normalize from '@/math/normalize';
import {
	ATTACK_TARGET, ATTACK_STEER_FORCE, ATTACK_SPEED,
	ATTACK_STANDOFF_RANGE, ATTACK_STRAFE, ATTACK_STRAFE_TIMER, STRAFE_LEG_SECONDS,
} from '../components/attack';

interface TargetPosition {
	x: number
	y: number
}
type Scratch = ComponentSystemWorld & {
	positionByEid?: Record<number, TargetPosition>
};

// How hard a strafing ship leans back toward its standoff radius while sliding sideways. Small, so it weaves
// across the target's front rather than spiralling in or drifting out.
const STRAFE_RADIAL_PULL = 0.35;

// Steers each ship toward its target, renormalising to its top speed, then re-faces it. Target positions are
// gathered once per run via the `targets` query. An armed ship holds once its target is inside standoff range
// so it fights at range instead of ramming; a rammer (standoff 0) keeps closing.
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
	const dx = targetPosition.x - x;
	const dy = targetPosition.y - y;
	const distance = Math.sqrt(dx * dx + dy * dy);
	const force = normalize(dx, dy);

	const speed = attack[ATTACK_SPEED];
	const standoff = attack[ATTACK_STANDOFF_RANGE];

	// In firing range: hold rather than keep closing.
	if(standoff > 0 && distance <= standoff) {
		if(attack[ATTACK_STRAFE] === 1) {
			strafe(world, velocity, transform, attack, force, distance, standoff, speed);
		} else {
			// Freeze and face the target so the guns stay trained on it.
			velocity[VELOCITY_X_INDEX] = 0;
			velocity[VELOCITY_Y_INDEX] = 0;
			transform[TRANSFORM_ANGLE_INDEX] = computeAngle(dx, dy);
		}
		return;
	}

	const steerForce = attack[ATTACK_STEER_FORCE];
	const steered = normalize(velocity[VELOCITY_X_INDEX] + force.x * steerForce, velocity[VELOCITY_Y_INDEX] + force.y * steerForce);
	const newVelocityX = steered.x * speed;
	const newVelocityY = steered.y * speed;

	velocity[VELOCITY_X_INDEX] = newVelocityX;
	velocity[VELOCITY_Y_INDEX] = newVelocityY;
	transform[TRANSFORM_ANGLE_INDEX] = computeAngle(newVelocityX, newVelocityY);
};

// Slides perpendicular to the target, reversing each leg, easing back toward the standoff radius as it weaves.
// Faces the way it moves, so its shots leave out the side (the Missile Frigate).
function strafe(
	world: ComponentSystemWorld,
	velocity: Float32Array,
	transform: Float32Array,
	attack: Float32Array,
	force: { x: number, y: number },
	distance: number,
	standoff: number,
	speed: number,
) {
	// Advance this leg's clock; flip sides once it has slid long enough.
	const elapsed = world.elapsedTime / 1_000;
	let direction = attack[ATTACK_STRAFE_TIMER] >= 0 ? 1 : -1;
	let leg = Math.abs(attack[ATTACK_STRAFE_TIMER]) + elapsed;
	if(leg >= STRAFE_LEG_SECONDS) {
		direction = -direction;
		leg = 0;
	}
	attack[ATTACK_STRAFE_TIMER] = direction * leg;

	// Perpendicular to the aim line, plus a gentle radial pull back to the standoff radius.
	const perpX = -force.y * direction;
	const perpY = force.x * direction;
	const radial = Math.max(-1, Math.min(1, (distance - standoff) / standoff)) * STRAFE_RADIAL_PULL;
	const steered = normalize(perpX + force.x * radial, perpY + force.y * radial);
	const newVelocityX = steered.x * speed;
	const newVelocityY = steered.y * speed;

	velocity[VELOCITY_X_INDEX] = newVelocityX;
	velocity[VELOCITY_Y_INDEX] = newVelocityY;
	transform[TRANSFORM_ANGLE_INDEX] = computeAngle(newVelocityX, newVelocityY);
}

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
