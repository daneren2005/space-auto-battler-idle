import type { Config } from '@/game/components';

// A ship: small, fast, hunts enemies.  `attacks` opts it into the targeting component and `owner`
// (its station's eid) is supplied per-spawn.
export const shipConfig: Config = { type: 'ship', width: 10, height: 5, maxShields: 1, timeToRegenerateShields: 1, damageCooldown: 0.2, speed: 100, attacks: true, steerForce: 4 };
