import { killEntityWorker, DEAD_INDEX } from '@daneren2005/shared-memory-ecs';
import { loadFloat32, storeFloat32, subtractAtomicFloat } from '@daneren2005/shared-memory-objects';
import {
	createPhysicsUpdate,
	COLLIDABLE_QUERY,
	TRANSFORM_X_INDEX,
	TRANSFORM_Y_INDEX,
	TRANSFORM_ANGLE_INDEX,
	VELOCITY_X_INDEX,
	VELOCITY_Y_INDEX,
} from '@daneren2005/shared-memory-physics';
import type {
	CollisionEntity,
	MovingEntity,
	PhysicsUpdateComponents,
	PhysicsUpdateFunction,
} from '@daneren2005/shared-memory-physics';
import type { ComponentSystemCallbacks, EntityQueryComponents, UpdateEntityConfigObject } from '@daneren2005/shared-memory-ecs';
import type { Components } from '../components';
import type { CustomSystemWorld } from './game-component-system';
import computeAngle from '@/math/compute-angle';
import { HEALTH_SHIELDS, HEALTH_TIME_SINCE_DAMAGE, HEALTH_DAMAGE_COOLDOWN } from '../components/health';
import { CONTROLLER_MONEY } from '../components/controller';
import { CONTROLLED_OWNER } from '../components/controlled';

// The blocks this update hands its collision callback: the transform + velocity physics moves, the body it
// filters on, and the four game components a collision reads or writes.  Everything past the transform is
// optional because either side of a collision may be missing it - a station has no velocity of its own, and
// only a ship is `controlled`.
export type GamePhysicsComponents = PhysicsUpdateComponents & {
	health?: Float32Array
	entity?: Uint32Array
	controller?: Int32Array
	controlled?: Uint32Array
};

// Either side of a collision, which is all the damage / bounty code below needs of one: it works off the blocks
// rather than off which side moved.
type Combatant = MovingEntity<GamePhysicsComponents> | CollisionEntity<GamePhysicsComponents>;

// Per-run lookups, rebuilt by preRun and read by the updates that follow it in the same run.  A run is one
// unbroken pass - preRun, then every entity, then done - so there is never a second run part way through this
// one to overwrite them.
//
// Only the entities a collision has to reach *past* the two in front of it are here: a station's fleet, so a
// destroyed station takes its ships with it, and every entity's blocks by eid so a kill reward can be paid to
// a station neither side of the collision is.
interface CollidableBlocks {
	entity?: Uint32Array
	controller?: Int32Array
}
let blocksByEid: Record<number, CollidableBlocks> = {};
let shipsByStation: Record<number, Array<number>> = {};
// The entities that have already collided this run.  The physics broadphase reports every entity a ship has
// ended up overlapping, but a ship only ever bounces off (and trades a hit with) the first of them: bouncing
// twice in one run would flip its velocity straight back and leave it flying on into whatever it hit.
let collidedThisRun = new Set<number>();

// Movement, walls and collisions for every ship in the game.  shared-memory-physics owns the first and last of
// those: createPhysicsUpdate integrates velocity into the transform and then, straight after each ship has
// moved, reports whatever it has ended up on top of.  Which pairs are even eligible is decided by the collide
// categories the level hands out per faction, so `collide` below is only ever called for a real enemy and does
// not have to check colours the way the old collision system did.
const physics = createPhysicsUpdate<Components, GamePhysicsComponents, CustomSystemWorld>({
	// The game blocks that travel to the worker alongside the transform, for both sides of a collision.
	optional: ['health', 'entity', 'controller', 'controlled'],
	onCollision: collide,
});

// The bare physics update plus this game's walls.  Bouncing off the edge of the map is the one thing the
// library has no say in - it does not bound how far anything may travel - so it happens here, on the position
// physics has just written.
export const physicsUpdate: PhysicsUpdateFunction<Components, GamePhysicsComponents, CustomSystemWorld> = Object.assign(
	(world: CustomSystemWorld, entityId: number, components: GamePhysicsComponents, queries: EntityQueryComponents<Components>, callbacks: ComponentSystemCallbacks<Components>) => {
		physics(world, entityId, components, queries, callbacks);
		bounceOffWalls(world, components);
	},
	{
		// What PhysicsSystem reads off the update to set up the same components and queries it expects.  Passed
		// through from the update physics built so the two can never drift apart.
		physics: physics.physics,

		preRun(
			world: CustomSystemWorld,
			entities: Array<UpdateEntityConfigObject<GamePhysicsComponents>>,
			queries: EntityQueryComponents<Components>,
			callbacks: ComponentSystemCallbacks<Components>,
		) {
			// Builds the spatial index every collision is found through, from where each entity stands before any of
			// this run's movement has happened.
			physics.preRun?.(world, entities, queries, callbacks);

			blocksByEid = {};
			shipsByStation = {};
			collidedThisRun = new Set();
			for(const entity of queries[COLLIDABLE_QUERY] ?? []) {
				// The ECS types query blocks generically as ComponentTypedArray since it cannot know what this game
				// registered; narrow them to the concrete arrays the definitions allocate here, once, so nothing
				// downstream needs a cast of its own.
				const components = entity.components as GamePhysicsComponents;
				blocksByEid[entity.entityId] = {
					entity: components.entity,
					controller: components.controller,
				};

				const controlled = components.controlled;
				if(controlled) {
					const owner = controlled[CONTROLLED_OWNER];
					(shipsByStation[owner] ?? (shipsByStation[owner] = [])).push(entity.entityId);
				}
			}
		},
	},
);

// Keeps a ship on the map: crossing an edge flips it back off that wall and re-faces it along the new heading.
function bounceOffWalls(world: CustomSystemWorld, components: GamePhysicsComponents) {
	const transform = components.transform;
	const velocity = components.velocity;
	const bounds = world.bounds;

	let bounced = false;
	if(transform[TRANSFORM_X_INDEX] < 0 || transform[TRANSFORM_X_INDEX] > bounds.width) {
		velocity[VELOCITY_X_INDEX] = -velocity[VELOCITY_X_INDEX];
		bounced = true;
	}
	if(transform[TRANSFORM_Y_INDEX] < 0 || transform[TRANSFORM_Y_INDEX] > bounds.height) {
		velocity[VELOCITY_Y_INDEX] = -velocity[VELOCITY_Y_INDEX];
		bounced = true;
	}

	if(bounced) {
		transform[TRANSFORM_ANGLE_INDEX] = computeAngle(velocity[VELOCITY_X_INDEX], velocity[VELOCITY_Y_INDEX]);
	}
}

// One ship has run into an enemy.  Both sides take a point of shield damage, the killer's faction earns the
// kill reward, a dead station takes its whole fleet with it, and the ship bounces away from whatever it hit.
// A death costs the losing faction nothing beyond the ship: stations spawn on a timer rather than out of a
// bank of slots, so there is nothing for a dead ship to hand back.
//
// Called for the entity that *moved*, so `self` is always a ship (nothing else has a velocity) and `other` is
// the ship or station it landed on.  Two enemy ships that run into each other each get their own call with the
// roles swapped, which is what lets this act on `self` and leave the other side to its own call.
function collide(
	world: CustomSystemWorld,
	self: MovingEntity<GamePhysicsComponents>,
	other: CollisionEntity<GamePhysicsComponents>,
	queries: EntityQueryComponents<Components>,
	callbacks: ComponentSystemCallbacks<Components>,
) {
	if(collidedThisRun.has(self.entityId)) {
		return;
	}
	collidedThisRun.add(self.entityId);

	const velocity = self.components.velocity;
	velocity[VELOCITY_X_INDEX] = -velocity[VELOCITY_X_INDEX];
	velocity[VELOCITY_Y_INDEX] = -velocity[VELOCITY_Y_INDEX];
	self.components.transform[TRANSFORM_ANGLE_INDEX] = computeAngle(velocity[VELOCITY_X_INDEX], velocity[VELOCITY_Y_INDEX]);

	exchangeDamage(self, other, callbacks);
}

function exchangeDamage(self: Combatant, other: Combatant, callbacks: ComponentSystemCallbacks<Components>) {
	if(!canTakeDamage(self) || !canTakeDamage(other)) {
		return;
	}

	// A station is worth its whole fleet as a kill reward; a ship is worth one.  Counted before the damage lands,
	// while that fleet is still alive.
	const otherWorth = other.components.controller ? shipsByStation[other.entityId]?.length ?? 0 : 1;

	takeDamage(self, 1, callbacks);
	takeDamage(other, 1, callbacks);

	if(isDead(other)) {
		// self got the kill, so its faction earns the reward.
		creditMoney(ownerOf(self), otherWorth);
	}
	if(isDead(self)) {
		// whatever killed self earns the reward for the ship (worth one).
		creditMoney(ownerOf(other), 1);
	}
}

function takeDamage(combatant: Combatant, damage: number, callbacks: ComponentSystemCallbacks<Components>) {
	const health = combatant.components.health;
	if(!health) {
		return;
	}

	// updateHealthTimersUpdate regenerates this same shield value on another worker thread, so the subtract has
	// to be an atomic read-modify-write; subtractAtomicFloat returns the resulting total so we can tell whether
	// this hit was the killing blow off the value we actually wrote (not a re-read that regen may have bumped).
	// -Infinity as the floor disables its clamp so shields are still allowed to cross below zero.
	const remainingShields = subtractAtomicFloat(health, HEALTH_SHIELDS, damage, -Infinity);
	storeFloat32(health, HEALTH_TIME_SINCE_DAMAGE, 0);
	if(remainingShields >= 0) {
		return;
	}

	kill(combatant.entityId, combatant.components.entity, callbacks);

	// A destroyed station takes its whole fleet down with it.
	if(combatant.components.controller) {
		for(const shipEid of shipsByStation[combatant.entityId] ?? []) {
			kill(shipEid, blocksByEid[shipEid]?.entity, callbacks);
		}
	}
}

function kill(entityId: number, entity: Uint32Array | undefined, callbacks: ComponentSystemCallbacks<Components>) {
	if(!entity) {
		return;
	}

	// killEntityWorker only needs the entity block to flag it dead; it reports the death back so the main
	// thread runs the same cleanup killEntity would.
	killEntityWorker(entityId, { entity }, callbacks);
}

// The faction (station eid) an entity belongs to: a station is its own faction, a ship's is its owner.
function ownerOf(combatant: Combatant): number | undefined {
	if(combatant.components.controller) {
		return combatant.entityId;
	}

	const controlled = combatant.components.controlled;
	return controlled ? controlled[CONTROLLED_OWNER] : undefined;
}

// Credit a faction's kill-reward `money`.  Only the player ever spends it, but it is tracked for everyone.
function creditMoney(stationEid: number | undefined, amount: number) {
	if(stationEid === undefined) {
		return;
	}

	const controller = blocksByEid[stationEid]?.controller;
	if(controller) {
		// Other ships in this same run touch this money on other threads too, so add atomically.
		Atomics.add(controller, CONTROLLER_MONEY, amount);
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

	// timeSinceTakenDamage is advanced by updateHealthTimersUpdate on another thread; read it atomically.
	// damageCooldown is immutable config, so a plain read is fine.
	return loadFloat32(health, HEALTH_TIME_SINCE_DAMAGE) >= health[HEALTH_DAMAGE_COOLDOWN];
}

export default physicsUpdate;
