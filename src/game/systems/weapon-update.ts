import { createEntityWorker } from '@daneren2005/shared-memory-ecs/worker';
import type { EntityWorkerSystemWorld, EntityUpdateFunction } from '@daneren2005/shared-memory-ecs';
import { TRANSFORM_X_INDEX, TRANSFORM_Y_INDEX, BODY_CATEGORY_INDEX, BODY_MASK_INDEX } from '@daneren2005/shared-memory-physics';
import type { Components, ComponentArrays } from '../components';
import { ATTACK_TARGET } from '../components/attack';
import { CONTROLLED_OWNER } from '../components/controlled';
import {
	WEAPON_RANGE, WEAPON_FIRE_INTERVAL, WEAPON_PROJECTILE_COUNT, WEAPON_SPREAD,
	WEAPON_PROJECTILE_SPEED, WEAPON_DAMAGE, WEAPON_HOMING, WEAPON_HOMING_TURN,
	WEAPON_SPAWNS_DRONES, WEAPON_TIME_SINCE_FIRED,
} from '../components/weapon';

interface TargetPosition {
	x: number
	y: number
}
type Scratch = EntityWorkerSystemWorld & {
	positionByEid?: Record<number, TargetPosition>
};

// Each armed ship fires at its already-picked target when it's in range and the cooldown has elapsed. Each shot
// (projectile, or a Carrier's drone) is created off-thread from its factory config; the main thread adopts it next
// frame.
export const weaponUpdate: EntityUpdateFunction<Components, Pick<ComponentArrays, 'weapon' | 'attack' | 'transform' | 'body' | 'controlled'>> = (world, entityId, components, queries, callbacks) => {
	const scratch = world as Scratch;
	const weapon = components.weapon;
	const attack = components.attack;
	const transform = components.transform;
	if(!scratch.positionByEid) {
		return;
	}

	// Cooldown clock always advances (world runs in ms; the interval is in seconds).
	weapon[WEAPON_TIME_SINCE_FIRED] += world.elapsedTime / 1_000;

	const target = attack[ATTACK_TARGET];
	if(!target) {
		return;
	}
	const targetPosition = scratch.positionByEid[target];
	if(!targetPosition) {
		return;
	}

	const x = transform[TRANSFORM_X_INDEX];
	const y = transform[TRANSFORM_Y_INDEX];
	const dx = targetPosition.x - x;
	const dy = targetPosition.y - y;
	if(Math.sqrt(dx * dx + dy * dy) > weapon[WEAPON_RANGE]) {
		return;
	}
	if(weapon[WEAPON_TIME_SINCE_FIRED] < weapon[WEAPON_FIRE_INTERVAL]) {
		return;
	}
	weapon[WEAPON_TIME_SINCE_FIRED] = 0;

	fireVolley(world, x, y, dx, dy, weapon, components.body, components.controlled[CONTROLLED_OWNER], target, callbacks);
};

// Launches one volley: `count` shots fanned across `spread`, aimed from (x, y) at the target. Shots inherit the
// ship's collide category/mask and owner. A Carrier launches drone sub-ships in the same fan instead.
function fireVolley(
	world: EntityWorkerSystemWorld,
	x: number,
	y: number,
	dx: number,
	dy: number,
	weapon: Float32Array,
	body: Uint32Array,
	owner: number,
	target: number,
	callbacks: Parameters<typeof weaponUpdate>[4],
) {
	const baseAngle = Math.atan2(dy, dx);
	const count = weapon[WEAPON_PROJECTILE_COUNT];
	const spread = weapon[WEAPON_SPREAD];
	const speed = weapon[WEAPON_PROJECTILE_SPEED];
	const damage = weapon[WEAPON_DAMAGE];
	const homing = weapon[WEAPON_HOMING] !== 0;
	const turn = homing ? weapon[WEAPON_HOMING_TURN] : 0;
	const spawnsDrones = weapon[WEAPON_SPAWNS_DRONES] !== 0;
	// Crosses the weapon's range, plus slack for a target that drifts further out.
	const lifetime = weapon[WEAPON_RANGE] / speed + 0.25;
	const collideCategory = body[BODY_CATEGORY_INDEX];
	const collideMask = body[BODY_MASK_INDEX];

	for(let i = 0; i < count; i++) {
		// Fan symmetrically about the aim line: one shot dead on, more spread evenly across it.
		const offset = count > 1 ? (i / (count - 1) - 0.5) * spread : 0;
		const angle = baseAngle + offset;
		const velocityX = Math.cos(angle) * speed;
		const velocityY = Math.sin(angle) * speed;

		if(spawnsDrones) {
			// A drone is a full ship: it launches on the fan heading, then targets and rams with its own stats.
			createEntityWorker(world, {
				type: 'drone',
				x, y,
				owner,
				velocityX, velocityY,
				angle,
				collideCategory,
				collideMask,
			}, callbacks);
			continue;
		}

		createEntityWorker(world, {
			type: 'projectile',
			x, y,
			owner,
			velocityX, velocityY,
			angle,
			contactDamage: damage,
			remainingLifetime: lifetime,
			target: homing ? target : 0,
			turn,
			collideCategory,
			collideMask,
		}, callbacks);
	}
}

// Gather every target's position once per run, so a firing ship can look up its aim point (like move-to-target).
weaponUpdate.preRun = (world, entities, queries) => {
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
