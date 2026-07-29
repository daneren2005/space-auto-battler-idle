import type { Config } from '@/game/components';

// A ship: small, fast, hunts enemies.  `attacks` opts it into the targeting component and `owner`
// (its station's eid) is supplied per-spawn.  `steerForceBonus` rolls each ship somewhere between 10 and 15
// steer force as it spawns, so no two turn at quite the same radius.
export const shipConfig: Config = {
	type: 'ship', width: 10, height: 5, maxShields: 0, timeToRegenerateShields: 1, damageCooldown: 0.2,
	speed: 100, attacks: true, steerForce: 10, steerForceBonus: 0.5,
};
