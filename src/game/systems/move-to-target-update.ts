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

// How hard a strafing ship leans back toward its standoff radius while sliding sideways, as a fraction of its
// sideways motion.  Small, so it reads as a weave across the target's front that holds its range rather than a
// spiral in or a drift out.
const STRAFE_RADIAL_PULL = 0.35;

// Steers each ship toward its assigned target by nudging its velocity toward the target and renormalising to
// the ship's top speed, then re-faces it along the new heading.  Target positions are gathered once per run
// via the `targets` query (everything with a transform) so a ship can look up whoever it is chasing.
//
// An armed ship stops charging once its target is inside its standoff range (its weapon range) so it can hold
// and shoot instead of ramming: a plain gunship freezes and faces the target, a strafer slides side-to-side
// across it (see below).  Because a ship always targets its nearest enemy, holding while that nearest enemy is
// in range is exactly "stop when close enough to fire, and only close in again once every near target is dead" -
// the moment the last in-range enemy falls, the next-nearest is out of range and the ship advances on it.  A
// rammer (standoff 0 - the Skiff, Detonator, drones) never holds and keeps closing to make contact.
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

	// In firing range: hold rather than keep closing, so an armed ship fights at range instead of ramming.
	if(standoff > 0 && distance <= standoff) {
		if(attack[ATTACK_STRAFE] === 1) {
			strafe(world, velocity, transform, attack, force, distance, standoff, speed);
		} else {
			// Freeze in place and face the target so the ship's guns stay trained on it.
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

// Slides a strafing ship perpendicular to its target, reversing each leg, while easing back toward its standoff
// radius so it holds range as it weaves.  It faces the way it is moving - which puts the target off its beam - so
// its shots leave out the side (the Missile Frigate raining homing missiles across the enemy's front).
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
	// Advance this leg's clock; flip to the other side once it has slid long enough.
	const elapsed = world.elapsedTime / 1_000;
	let direction = attack[ATTACK_STRAFE_TIMER] >= 0 ? 1 : -1;
	let leg = Math.abs(attack[ATTACK_STRAFE_TIMER]) + elapsed;
	if(leg >= STRAFE_LEG_SECONDS) {
		direction = -direction;
		leg = 0;
	}
	attack[ATTACK_STRAFE_TIMER] = direction * leg;

	// Perpendicular to the aim line (the side chosen by the current leg), plus a gentle pull along it back to the
	// standoff radius: positive to move in when too far, negative to ease out when too close.
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
