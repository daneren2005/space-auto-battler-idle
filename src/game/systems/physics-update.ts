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
import { COMBAT_CONTACT_DAMAGE, COMBAT_BLAST_RADIUS } from '../components/combat';

// The blocks this update hands its collision callback: the transform + velocity physics moves, the body it
// filters on, and the four game components a collision reads or writes.  Everything past the transform is
// optional because either side of a collision may be missing it - a station has no velocity of its own, and
// only a ship is `controlled`.
export type GamePhysicsComponents = PhysicsUpdateComponents & {
	health?: Float32Array
	entity?: Uint32Array
	controller?: Int32Array
	controlled?: Uint32Array
	combat?: Float32Array
	projectile?: Float32Array
};

// Either side of a collision, which is all the damage / bounty code below needs of one: it works off the blocks
// rather than off which side moved.
type Combatant = MovingEntity<GamePhysicsComponents> | CollisionEntity<GamePhysicsComponents>;

// Per-run lookups, rebuilt by preRun and read by the updates that follow it in the same run.  A run is one
// unbroken pass - preRun, then every entity, then done - so there is never a second run part way through this
// one to overwrite them.
//
// Only the entities a collision has to reach *past* the two in front of it are here: a station's fleet, so a
// destroyed station takes its ships with it, and every entity's blocks by eid so a kill reward can be paid to a
// station neither side of the collision is - and, for a detonator, so the blast can find and damage every enemy
// standing near the point of contact, none of which is the entity it actually ran into.
interface CollidableBlocks {
	entity?: Uint32Array
	controller?: Int32Array
	controlled?: Uint32Array
	transform?: Float32Array
	health?: Float32Array
	body?: Uint32Array
}
let blocksByEid: Record<number, CollidableBlocks> = {};
// Every collidable entity's eid, so a detonation can sweep them for who is inside its blast radius.
let collidableEids: Array<number> = [];
let shipsByStation: Record<number, Array<number>> = {};
// The entities that have already collided this run.  The physics broadphase reports every entity a ship has
// ended up overlapping, but a ship only ever trades a hit - and re-faces along its new heading - with the first
// of them, so the damage is dealt once per run rather than once per enemy it happens to be touching.  The bounce
// itself is native now (the ship's bounciness), and physics already guards against reflecting a velocity that is
// on its way back out, so this set is only about the game's own once-per-run response.
let collidedThisRun = new Set<number>();

// Movement, walls and collisions for every ship in the game.  shared-memory-physics owns the first and last of
// those: createPhysicsUpdate integrates velocity into the transform and then, straight after each ship has
// moved, reports whatever it has ended up on top of.  Which pairs are even eligible is decided by the collide
// categories the level hands out per faction, so `collide` below is only ever called for a real enemy and does
// not have to check colours the way the old collision system did.
const physics = createPhysicsUpdate<Components, GamePhysicsComponents, CustomSystemWorld>({
	// The game blocks that travel to the worker alongside the transform, for both sides of a collision.
	optional: ['health', 'entity', 'controller', 'controlled', 'combat', 'projectile'],
	onCollision: collide,
});

// The bare physics update plus this game's walls.  Bouncing off the edge of the map is the one thing the
// library has no say in - it does not bound how far anything may travel - so it happens here, on the position
// physics has just written.
export const physicsUpdate: PhysicsUpdateFunction<Components, GamePhysicsComponents, CustomSystemWorld> = Object.assign(
	(world: CustomSystemWorld, entityId: number, components: GamePhysicsComponents, queries: EntityQueryComponents<Components>, callbacks: ComponentSystemCallbacks<Components>) => {
		physics(world, entityId, components, queries, callbacks);
		// Ships are kept on the map by bouncing off its edges; a projectile instead just flies off and expires on
		// its lifetime (see update-projectiles), so it is left to leave rather than rattling around inside.
		if(!components.projectile) {
			bounceOffWalls(world, components);
		}
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
			collidableEids = [];
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
					controlled: components.controlled,
					transform: components.transform,
					health: components.health,
					body: components.body,
				};
				collidableEids.push(entity.entityId);

				// A projectile is `controlled` too (its owner pays for its kills), but it is not part of a station's
				// fleet - so it neither dies when that station falls nor counts toward the station's kill worth.
				const controlled = components.controlled;
				if(controlled && !components.projectile) {
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

// One ship has run into an enemy.  The bounce is native - the ship carries a bounciness of 1, so physics has
// already reflected its velocity off `other` by the time this runs - so all that is left to the game is to
// re-face the ship along its new heading, deal a point of shield damage each way, hand the killer's faction the
// kill reward, and take a dead station's whole fleet down with it.  A death costs the losing faction nothing
// beyond the ship: stations spawn on a timer rather than out of a bank of slots, so there is nothing to hand back.
//
// Called for the entity that *moved*, so `self` is always a ship or a projectile (nothing else has a velocity)
// and `other` is whatever it landed on.  Two enemy ships that run into each other each get their own call with
// the roles swapped, which is what lets this act on `self` and leave the other side to its own call.
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

	// A projectile is a sensor: it also shows up as an overlap on the ship that ran into it, but the hit is only
	// ever resolved from the projectile's own side, so a ship colliding with an enemy shot leaves it alone here.
	// Two projectiles pass straight through each other.
	if(other.components.projectile) {
		return;
	}

	collidedThisRun.add(self.entityId);

	if(self.components.projectile) {
		projectileHit(self, other, callbacks);
		return;
	}

	// A detonator explodes on contact, dealing its damage to every enemy within a blast radius rather than trading
	// a single hit, and dies - so it resolves the whole collision from its own side.
	if(isDetonator(self)) {
		detonate(self, callbacks);
		return;
	}
	// The other side of a detonation: like a projectile, leave a detonator to its own call, so a ship that runs
	// into one neither rams it nor takes its blast twice.
	if(isDetonator(other)) {
		return;
	}

	// Physics reflected the velocity for us; the ship's sprite faces along its heading, so re-face it to match
	// where the bounce is now sending it.
	const velocity = self.components.velocity;
	self.components.transform[TRANSFORM_ANGLE_INDEX] = computeAngle(velocity[VELOCITY_X_INDEX], velocity[VELOCITY_Y_INDEX]);

	exchangeDamage(self, other, callbacks);
}

// A projectile has reached an enemy.  Unlike a ram it is one-sided: the shot deals its damage to whatever it
// hit, pays its owner if that was a kill (a station is still worth its whole fleet), and is then consumed - it
// takes no damage back and does not bounce (it is a sensor).  If the target is mid damage-cooldown the shot
// passes through untouched and may connect on a later frame instead.
function projectileHit(self: MovingEntity<GamePhysicsComponents>, other: CollisionEntity<GamePhysicsComponents>, callbacks: ComponentSystemCallbacks<Components>) {
	if(!canTakeDamage(other)) {
		return;
	}

	const otherWorth = other.components.controller ? shipsByStation[other.entityId]?.length ?? 0 : 1;
	takeDamage(other, contactDamageOf(self), callbacks);
	if(isDead(other)) {
		creditMoney(ownerOf(self), otherWorth);
	}

	kill(self.entityId, self.components.entity, callbacks);
}

// Whether a combatant explodes on contact rather than ramming: its combat block carries a blast radius.
function isDetonator(combatant: Combatant): boolean {
	const combat = combatant.components.combat;
	return !!combat && combat[COMBAT_BLAST_RADIUS] > 0;
}

// A detonator has reached an enemy and goes off.  Unlike a ram, the hit reaches past the entity it ran into: it
// deals its contact damage to every enemy standing within `blastRadius` of the point of contact - each is worth
// its usual reward to the detonator's faction on a kill - and then the detonator itself is destroyed.  It takes
// nothing back and does not bounce; the collision is spent entirely here.
function detonate(self: MovingEntity<GamePhysicsComponents>, callbacks: ComponentSystemCallbacks<Components>) {
	const combat = self.components.combat;
	const body = self.components.body;
	const transform = self.components.transform;
	// combat + body are what marked it a detonator, but guard anyway - without them it simply dies on contact.
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
			// Only enemies the detonator could collide with are caught in the blast; friendlies share its collide
			// category, which its mask excludes, so they pass through it unharmed.
			if((mask & otherBody[BODY_CATEGORY_INDEX]) === 0) {
				continue;
			}

			// Measured to the target's hull, as the blast reaching its near edge is enough to catch it.
			const half = Math.max(otherTransform[TRANSFORM_WIDTH_INDEX], otherTransform[TRANSFORM_HEIGHT_INDEX]) / 2;
			const dx = otherTransform[TRANSFORM_X_INDEX] - sx;
			const dy = otherTransform[TRANSFORM_Y_INDEX] - sy;
			const reach = radius + half;
			if(dx * dx + dy * dy > reach * reach) {
				continue;
			}

			// A station is worth its whole fleet, a ship worth one - counted before the hit, while that fleet is alive.
			const worth = blocks.controller ? shipsByStation[eid]?.length ?? 0 : 1;
			if(damageEid(eid, damage, callbacks)) {
				creditMoney(attackerOwner, worth);
			}
		}
	}

	kill(self.entityId, self.components.entity, callbacks);
}

// Applies damage to a collidable by eid rather than to a collision Combatant, for the detonator's blast - which
// reaches entities that are not either side of the collision physics reported.  Mirrors takeDamage + its
// damage-cooldown gate + the destroyed-station-takes-its-fleet rule, off the blocks gathered in preRun; returns
// whether the hit was fatal so the caller can pay the bounty.
function damageEid(eid: number, damage: number, callbacks: ComponentSystemCallbacks<Components>): boolean {
	const blocks = blocksByEid[eid];
	const health = blocks?.health;
	if(!health) {
		return false;
	}

	// Same gate as canTakeDamage: a target still inside its damage cooldown shrugs the blast off.
	if(loadFloat32(health, HEALTH_TIME_SINCE_DAMAGE) < health[HEALTH_DAMAGE_COOLDOWN]) {
		return false;
	}

	const remainingShields = subtractAtomicFloat(health, HEALTH_SHIELDS, damage, -Infinity);
	storeFloat32(health, HEALTH_TIME_SINCE_DAMAGE, 0);
	if(remainingShields >= 0) {
		return false;
	}

	kill(eid, blocks.entity, callbacks);
	// A destroyed station takes its whole fleet down with it.
	if(blocks.controller) {
		for(const shipEid of shipsByStation[eid] ?? []) {
			kill(shipEid, blocksByEid[shipEid]?.entity, callbacks);
		}
	}
	return true;
}

function exchangeDamage(self: Combatant, other: Combatant, callbacks: ComponentSystemCallbacks<Components>) {
	if(!canTakeDamage(self) || !canTakeDamage(other)) {
		return;
	}

	// A station is worth its whole fleet as a kill reward; a ship is worth one.  Counted before the damage lands,
	// while that fleet is still alive.
	const otherWorth = other.components.controller ? shipsByStation[other.entityId]?.length ?? 0 : 1;

	// Each side removes its own contact damage from the other; a combatant with no combat block (a station) falls
	// back to one, which is what the ram used to deal flat.
	takeDamage(self, contactDamageOf(other), callbacks);
	takeDamage(other, contactDamageOf(self), callbacks);

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

// How much damage a combatant deals on contact: its combat block's contactDamage, or one for anything without a
// combat block (a station, which never rams but can be rammed) so a hit still lands the way it always did.
function contactDamageOf(combatant: Combatant): number {
	const combat = combatant.components.combat;
	return combat ? combat[COMBAT_CONTACT_DAMAGE] : 1;
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
