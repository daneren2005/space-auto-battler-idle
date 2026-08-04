import { createEntityWorker } from '@daneren2005/shared-memory-ecs/worker';
import type { ComponentSystemWorld, EntityUpdateFunction } from '@daneren2005/shared-memory-ecs';
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
type Scratch = ComponentSystemWorld & {
	positionByEid?: Record<number, TargetPosition>
};

// Each armed ship fires its weapon at the target the targeting system has already picked for it, whenever that
// target is inside the weapon's range and its cooldown has elapsed.  A volley is `projectileCount` shots fanned
// evenly across `spread` radians, launched from the ship toward the target; homing shots additionally carry the
// target eid + a steer force so update-projectiles can chase it, while straight shots simply coast on the launch
// velocity.  Creation can't happen in a worker (eid allocation lives on the main thread), so createEntityWorker
// buffers each shot's flat config and the projectiles first exist next frame - exactly as the spawn system does.
export const weaponUpdate: EntityUpdateFunction<Components, Pick<ComponentArrays, 'weapon' | 'attack' | 'transform' | 'body' | 'controlled'>> = (world, entityId, components, queries, callbacks) => {
	const scratch = world as Scratch;
	const weapon = components.weapon;
	const attack = components.attack;
	const transform = components.transform;
	if(!scratch.positionByEid) {
		return;
	}

	// The cooldown clock always advances (world runs in ms; the interval is in seconds).
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

	fireVolley(x, y, dx, dy, weapon, components.body, components.controlled[CONTROLLED_OWNER], target, callbacks);
};

// Launches one volley: `count` shots fanned across `spread`, each aimed from (x, y) along the direction to the
// target.  A shot inherits the firing ship's collide category + mask (so it hits the same enemies the ship does)
// and its owner (so a kill it lands pays the ship's faction).  A Carrier's weapon launches drone sub-ships in the
// same fan instead of projectiles - full ships that fly out on the launch heading and then hunt on their own.
function fireVolley(
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
	// Live long enough to cross the weapon's whole range, plus a little slack so a shot fired at the edge can
	// still reach a target that has drifted a touch further out.
	const lifetime = weapon[WEAPON_RANGE] / speed + 0.25;
	const collideCategory = body[BODY_CATEGORY_INDEX];
	const collideMask = body[BODY_MASK_INDEX];

	for(let i = 0; i < count; i++) {
		// Fan the volley symmetrically about the aim line: one shot fires dead on, more spread evenly across it.
		const offset = count > 1 ? (i / (count - 1) - 0.5) * spread : 0;
		const angle = baseAngle + offset;
		const velocityX = Math.cos(angle) * speed;
		const velocityY = Math.sin(angle) * speed;

		if(spawnsDrones) {
			// A drone is a full ship, not a shot: it launches on the fan heading and then targets and rams like a
			// Wasp, carrying its own fixed stats rather than the weapon's per-shot damage or lifetime.
			createEntityWorker({
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

		createEntityWorker({
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

// Gather every possible target's position once per run, so a firing ship can look up whoever it is aiming at -
// the same approach move-to-target uses to steer.
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
