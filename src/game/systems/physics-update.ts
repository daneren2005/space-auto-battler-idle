import { killEntityWorker, DEAD_INDEX } from '@daneren2005/shared-memory-ecs/worker';
import { subtractAtomicFloat } from '@daneren2005/shared-memory-objects/utils/atomic-math';
import { loadFloat32, storeFloat32 } from '@daneren2005/shared-memory-objects/utils/float32-atomics';
import {
	createPhysicsUpdate,
	COLLIDABLE_QUERY,
	TRANSFORM_X_INDEX,
	TRANSFORM_Y_INDEX,
	TRANSFORM_WIDTH_INDEX,
	TRANSFORM_HEIGHT_INDEX,
	TRANSFORM_ANGLE_INDEX,
	VELOCITY_X_INDEX,
	VELOCITY_Y_INDEX,
	BODY_CATEGORY_INDEX,
	BODY_MASK_INDEX,
	updateSpatialMap,
} from '@daneren2005/shared-memory-physics';
import type {
	CollisionEntity,
	MovingEntity,
	PhysicsUpdateComponents,
	PhysicsUpdateFunction,
} from '@daneren2005/shared-memory-physics';
import type { EntityWorkerSystemCallbacks, EntityQueryComponents, UpdateEntityConfigObject } from '@daneren2005/shared-memory-ecs';
import type { Components } from '../components';
import type { CustomSystemWorld } from './game-entity-worker-system';
import computeAngle from '@/math/compute-angle';
import { HEALTH_SHIELDS, HEALTH_TIME_SINCE_DAMAGE, HEALTH_DAMAGE_COOLDOWN } from '../components/health';
import { CONTROLLER_MONEY, CONTROLLER_MONEY_MULT, CONTROLLER_MULT_SCALE } from '../components/controller';
import { CONTROLLED_OWNER } from '../components/controlled';
import { COMBAT_CONTACT_DAMAGE, COMBAT_BLAST_RADIUS, COMBAT_BOUNTY, DETONATED_EVENT } from '../components/combat';

// Everything past the transform is optional because either side of a collision may lack it.
export type GamePhysicsComponents = PhysicsUpdateComponents & {
	health?: Float32Array
	entity?: Uint32Array
	controller?: Int32Array
	controlled?: Uint32Array
	combat?: Float32Array
	projectile?: Float32Array
};

type Combatant = MovingEntity<GamePhysicsComponents> | CollisionEntity<GamePhysicsComponents>;

// Per-run lookups rebuilt by preRun: every entity's blocks by eid, every collidable eid, and each station's
// fleet - so a collision can reach past the two entities in front of it (blast targets, bounty payees).
interface CollidableBlocks {
	entity?: Uint32Array
	controller?: Int32Array
	controlled?: Uint32Array
	transform?: Float32Array
	health?: Float32Array
	body?: Uint32Array
	combat?: Float32Array
}
let blocksByEid: Record<number, CollidableBlocks> = {};
let collidableEids: Array<number> = [];
let shipsByStation: Record<number, Array<number>> = {};
// A ship trades a hit with only its first collision this run, not every overlap the broadphase reports.
let collidedThisRun = new Set<number>();

// Eligible pairs are decided by per-faction collide categories, so `collide` only ever sees a real enemy.
const physics = createPhysicsUpdate<Components, GamePhysicsComponents, CustomSystemWorld>({
	optional: ['health', 'entity', 'controller', 'controlled', 'combat', 'projectile'],
	onCollision: collide,
});

// The library doesn't bound travel, so wall-bouncing happens here, on the position physics just wrote.
export const physicsUpdate: PhysicsUpdateFunction<Components, GamePhysicsComponents, CustomSystemWorld> = Object.assign(
	(world: CustomSystemWorld, entityId: number, components: GamePhysicsComponents, queries: EntityQueryComponents<Components>, callbacks: EntityWorkerSystemCallbacks<Components>) => {
		physics(world, entityId, components, queries, callbacks);
		// A projectile expires on its lifetime (see update-projectiles) rather than bouncing.
		if(!components.projectile && bounceOffWalls(world, components)) {
			updateSpatialMap(world, entityId, components);
		}
	},
	{
		physics: physics.physics,

		preRun(
			world: CustomSystemWorld,
			entities: Array<UpdateEntityConfigObject<GamePhysicsComponents>>,
			queries: EntityQueryComponents<Components>,
			callbacks: EntityWorkerSystemCallbacks<Components>,
		) {
			physics.preRun?.(world, entities, queries, callbacks);

			blocksByEid = {};
			collidableEids = [];
			shipsByStation = {};
			collidedThisRun = new Set();
			for(const entity of queries[COLLIDABLE_QUERY] ?? []) {
				// Narrow the query blocks to concrete arrays once, so nothing downstream needs its own cast.
				const components = entity.components as GamePhysicsComponents;
				blocksByEid[entity.entityId] = {
					entity: components.entity,
					controller: components.controller,
					controlled: components.controlled,
					transform: components.transform,
					health: components.health,
					body: components.body,
					combat: components.combat,
				};
				collidableEids.push(entity.entityId);

				// A projectile is `controlled` too, but isn't part of a station's fleet.
				const controlled = components.controlled;
				if(controlled && !components.projectile) {
					const owner = controlled[CONTROLLED_OWNER];
					(shipsByStation[owner] ?? (shipsByStation[owner] = [])).push(entity.entityId);
				}
			}
		},
	},
);

// Crossing an edge flips the velocity off that wall and re-faces the ship along the new heading.
function bounceOffWalls(world: CustomSystemWorld, components: GamePhysicsComponents): boolean {
	const transform = components.transform;
	const velocity = components.velocity;
	const bounds = world.bounds;

	let bounced = false;
	const x = transform[TRANSFORM_X_INDEX];
	if(x < 0) {
		transform[TRANSFORM_X_INDEX] = 0;
		if(velocity[VELOCITY_X_INDEX] < 0) {
			velocity[VELOCITY_X_INDEX] = -velocity[VELOCITY_X_INDEX];
		}
		bounced = true;
	} else if(x > bounds.width) {
		transform[TRANSFORM_X_INDEX] = bounds.width;
		if(velocity[VELOCITY_X_INDEX] > 0) {
			velocity[VELOCITY_X_INDEX] = -velocity[VELOCITY_X_INDEX];
		}
		bounced = true;
	}

	const y = transform[TRANSFORM_Y_INDEX];
	if(y < 0) {
		transform[TRANSFORM_Y_INDEX] = 0;
		if(velocity[VELOCITY_Y_INDEX] < 0) {
			velocity[VELOCITY_Y_INDEX] = -velocity[VELOCITY_Y_INDEX];
		}
		bounced = true;
	} else if(y > bounds.height) {
		transform[TRANSFORM_Y_INDEX] = bounds.height;
		if(velocity[VELOCITY_Y_INDEX] > 0) {
			velocity[VELOCITY_Y_INDEX] = -velocity[VELOCITY_Y_INDEX];
		}
		bounced = true;
	}

	if(bounced && (velocity[VELOCITY_X_INDEX] !== 0 || velocity[VELOCITY_Y_INDEX] !== 0)) {
		transform[TRANSFORM_ANGLE_INDEX] = computeAngle(velocity[VELOCITY_X_INDEX], velocity[VELOCITY_Y_INDEX]);
	}

	return bounced;
}

// One ship ran into an enemy. Physics already reflected the velocity; this re-faces `self`, exchanges damage
// and pays bounties. Called for the entity that moved, so acts on `self` alone - the other side gets its own call.
function collide(
	world: CustomSystemWorld,
	self: MovingEntity<GamePhysicsComponents>,
	other: CollisionEntity<GamePhysicsComponents>,
	queries: EntityQueryComponents<Components>,
	callbacks: EntityWorkerSystemCallbacks<Components>,
) {
	// A projectile (a sensor) and a detonator each resolve the whole collision one-sidedly. The library reports a
	// pair once, for whichever moved first, so that side can arrive as either `self` or `other` - resolve by role,
	// keyed on the special entity's own eid so it acts once per run without spending the ship's collision slot.
	const projectile = self.components.projectile ? self : other.components.projectile ? other : undefined;
	if(projectile) {
		if(!collidedThisRun.has(projectile.entityId)) {
			collidedThisRun.add(projectile.entityId);
			projectileHit(projectile, projectile === self ? other : self, callbacks);
		}
		return;
	}

	const detonator = isDetonator(self) ? self : isDetonator(other) ? other : undefined;
	if(detonator) {
		if(!collidedThisRun.has(detonator.entityId)) {
			collidedThisRun.add(detonator.entityId);
			detonate(detonator, callbacks);
		}
		return;
	}

	if(collidedThisRun.has(self.entityId)) {
		return;
	}
	collidedThisRun.add(self.entityId);

	// Re-face along the heading the bounce is now sending it.
	const velocity = self.components.velocity;
	self.components.transform[TRANSFORM_ANGLE_INDEX] = computeAngle(velocity[VELOCITY_X_INDEX], velocity[VELOCITY_Y_INDEX]);

	exchangeDamage(self, other, callbacks);
}

// One-sided: deals damage, pays the owner on a kill, then is consumed. A target mid-cooldown shrugs it off.
function projectileHit(self: Combatant, other: Combatant, callbacks: EntityWorkerSystemCallbacks<Components>) {
	if(!canTakeDamage(other)) {
		return;
	}

	const otherWorth = other.components.controller ? stationWorth(other.entityId) : shipWorth(other.components.combat);
	takeDamage(other, contactDamageOf(self), callbacks);
	if(isDead(other)) {
		creditMoney(ownerOf(self), otherWorth);
	}

	kill(self.entityId, self.components.entity, callbacks);
}

function isDetonator(combatant: Combatant): boolean {
	const combat = combatant.components.combat;
	return !!combat && combat[COMBAT_BLAST_RADIUS] > 0;
}

// Deals contact damage to every enemy within `blastRadius` of the contact point, then dies.
function detonate(self: Combatant, callbacks: EntityWorkerSystemCallbacks<Components>) {
	const combat = self.components.combat;
	const body = self.components.body;
	const transform = self.components.transform;
	if(combat && body) {
		const radius = combat[COMBAT_BLAST_RADIUS];
		const damage = combat[COMBAT_CONTACT_DAMAGE];
		const mask = body[BODY_MASK_INDEX];
		const sx = transform[TRANSFORM_X_INDEX];
		const sy = transform[TRANSFORM_Y_INDEX];
		const attackerOwner = ownerOf(self);

		for(const eid of collidableEids) {
			if(eid === self.entityId) {
				continue;
			}

			const blocks = blocksByEid[eid];
			const otherBody = blocks?.body;
			const otherTransform = blocks?.transform;
			if(!blocks?.health || !otherBody || !otherTransform) {
				continue;
			}
			// Only enemies: friendlies share the detonator's collide category, which its mask excludes.
			if((mask & otherBody[BODY_CATEGORY_INDEX]) === 0) {
				continue;
			}

			// Measured to the target's near edge, so the blast reaching its hull catches it.
			const half = Math.max(otherTransform[TRANSFORM_WIDTH_INDEX], otherTransform[TRANSFORM_HEIGHT_INDEX]) / 2;
			const dx = otherTransform[TRANSFORM_X_INDEX] - sx;
			const dy = otherTransform[TRANSFORM_Y_INDEX] - sy;
			const reach = radius + half;
			if(dx * dx + dy * dy > reach * reach) {
				continue;
			}

			// Counted before the hit, while the fleet is still alive.
			const worth = blocks.controller ? stationWorth(eid) : shipWorth(blocks.combat);
			if(damageEid(eid, damage, callbacks)) {
				creditMoney(attackerOwner, worth);
			}
		}

		// Emitted before the kill so the detonator is still alive when the event reaches the main thread.
		callbacks.emitEntityEvent(self.entityId, DETONATED_EVENT, sx, sy, radius);
	}

	kill(self.entityId, self.components.entity, callbacks);
}

// Damages a collidable by eid (for the blast, which reaches entities on neither side of a reported collision).
// Mirrors takeDamage's cooldown gate + station-takes-its-fleet rule; returns whether the hit was fatal.
function damageEid(eid: number, damage: number, callbacks: EntityWorkerSystemCallbacks<Components>): boolean {
	const blocks = blocksByEid[eid];
	const health = blocks?.health;
	if(!health) {
		return false;
	}

	if(loadFloat32(health, HEALTH_TIME_SINCE_DAMAGE) < health[HEALTH_DAMAGE_COOLDOWN]) {
		return false;
	}

	const remainingShields = subtractAtomicFloat(health, HEALTH_SHIELDS, damage, -Infinity);
	storeFloat32(health, HEALTH_TIME_SINCE_DAMAGE, 0);
	if(remainingShields >= 0) {
		return false;
	}

	kill(eid, blocks.entity, callbacks);
	// A destroyed station takes its whole fleet with it.
	if(blocks.controller) {
		for(const shipEid of shipsByStation[eid] ?? []) {
			kill(shipEid, blocksByEid[shipEid]?.entity, callbacks);
		}
	}
	return true;
}

function exchangeDamage(self: Combatant, other: Combatant, callbacks: EntityWorkerSystemCallbacks<Components>) {
	if(!canTakeDamage(self) || !canTakeDamage(other)) {
		return;
	}

	// Counted before the damage lands, while the fleet is still alive.
	const otherWorth = other.components.controller ? stationWorth(other.entityId) : shipWorth(other.components.combat);

	takeDamage(self, contactDamageOf(other), callbacks);
	takeDamage(other, contactDamageOf(self), callbacks);

	if(isDead(other)) {
		creditMoney(ownerOf(self), otherWorth);
	}
	if(isDead(self)) {
		creditMoney(ownerOf(other), shipWorth(self.components.combat));
	}
}

function takeDamage(combatant: Combatant, damage: number, callbacks: EntityWorkerSystemCallbacks<Components>) {
	const health = combatant.components.health;
	if(!health) {
		return;
	}

	// Shields are also regenerated on another thread, so this must be an atomic read-modify-write; its return
	// tells whether this hit was fatal off the value we wrote. -Infinity floor lets shields cross below zero.
	const remainingShields = subtractAtomicFloat(health, HEALTH_SHIELDS, damage, -Infinity);
	storeFloat32(health, HEALTH_TIME_SINCE_DAMAGE, 0);
	if(remainingShields >= 0) {
		return;
	}

	kill(combatant.entityId, combatant.components.entity, callbacks);

	// A destroyed station takes its whole fleet with it.
	if(combatant.components.controller) {
		for(const shipEid of shipsByStation[combatant.entityId] ?? []) {
			kill(shipEid, blocksByEid[shipEid]?.entity, callbacks);
		}
	}
}

function kill(entityId: number, entity: Uint32Array | undefined, callbacks: EntityWorkerSystemCallbacks<Components>) {
	if(!entity) {
		return;
	}

	// Idempotent per run: own collision, a blast, and a station fleet-wipe can all reach the same entity, but
	// only the first should emit a death - a second event has no entity left to find on the main thread.
	if(entity[DEAD_INDEX] === 1) {
		return;
	}

	// Flags it dead and reports the death back so the main thread runs the same cleanup killEntity would.
	killEntityWorker(entityId, { entity }, callbacks);
}

// Contact damage: the combat block's contactDamage, or 1 for anything without one (a station).
function contactDamageOf(combatant: Combatant): number {
	const combat = combatant.components.combat;
	return combat ? combat[COMBAT_CONTACT_DAMAGE] : 1;
}

// A station is its own faction; a ship's is its owner.
function ownerOf(combatant: Combatant): number | undefined {
	if(combatant.components.controller) {
		return combatant.entityId;
	}

	const controlled = combatant.components.controlled;
	return controlled ? controlled[CONTROLLED_OWNER] : undefined;
}

// The bounty stamped on the ship's combat block at spawn (scales with type price; see data/ship-types.ts).
function shipWorth(combat: Float32Array | undefined): number {
	return combat ? combat[COMBAT_BOUNTY] : 1;
}

// The sum of the station's living fleet's bounties, since it takes them all down with it. Counted off the
// preRun fleet, while it is all still alive.
function stationWorth(stationEid: number): number {
	let total = 0;
	for(const shipEid of shipsByStation[stationEid] ?? []) {
		total += shipWorth(blocksByEid[shipEid]?.combat);
	}
	return total;
}

// Only the player spends it, but it is tracked for everyone.
function creditMoney(stationEid: number | undefined, amount: number) {
	if(stationEid === undefined) {
		return;
	}

	const controller = blocksByEid[stationEid]?.controller;
	if(controller) {
		// Salvage (prestige) scales the player's take; enemies keep the default 1x multiplier.
		const scaled = Math.round(amount * controller[CONTROLLER_MONEY_MULT] / CONTROLLER_MULT_SCALE);
		// Other ships touch this money on other threads too, so add atomically.
		Atomics.add(controller, CONTROLLER_MONEY, scaled);
	}
}

function isDead(combatant: Combatant): boolean {
	const entity = combatant.components.entity;
	return !!entity && entity[DEAD_INDEX] === 1;
}
function canTakeDamage(combatant: Combatant): boolean {
	const health = combatant.components.health;
	if(!health) {
		return false;
	}

	// timeSinceTakenDamage is advanced on another thread; read it atomically. damageCooldown is immutable.
	return loadFloat32(health, HEALTH_TIME_SINCE_DAMAGE) >= health[HEALTH_DAMAGE_COOLDOWN];
}

export default physicsUpdate;
