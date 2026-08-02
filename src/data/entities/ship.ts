import type { Config } from '@/game/components';

// A ship: small, fast, hunts enemies.  It stays a 10x5 rectangle body - the default shape for a config with a
// width and a height - so it is only as wide as it looks nose-on.  `attacks` opts it into the targeting
// component and `owner` (its station's eid) is supplied per-spawn, along with the collide category + mask it
// inherits from that station.  `steerForceBonus` rolls each ship somewhere between 10 and 15 steer force as it
// spawns, so no two turn at quite the same radius.
//
// `velocityX` of 0 is what loads the velocity component: a ship spawned by a station overrides it with a real
// heading, and one placed directly (a test, a scripted encounter) still starts out able to move.
// `interpolate` gives it a render position: physics runs on a 50ms step, so without one a ship's sprite would
// only move on one frame in three.
//
// `bounciness` of 1 is what makes a ship rebound off whatever it runs into with no speed lost: physics reflects
// its velocity about the contact normal on collision, so the bounce is native rather than something the physics
// update writes by hand.  Stations never move, so only ships carry it.
export const shipConfig: Config = {
	type: 'ship', width: 10, height: 5, maxShields: 0, timeToRegenerateShields: 1, damageCooldown: 0.2,
	velocityX: 0, speed: 100, attacks: true, steerForce: 10, steerForceBonus: 0.5, interpolate: true, bounciness: 1,
};
