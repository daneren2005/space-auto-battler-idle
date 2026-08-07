import type { Config } from '@/game/components';
import { DEFAULT_SEARCH_RANGE } from '@/game/components/attack';

// A drone: the sub-ship a Carrier launches instead of a projectile. A full ship (targets, steers, rams like a
// Wasp) but not a buildable `ShipType`, so it has no level scaling and always spawns at these fixed stats.
export const droneConfig: Config = {
	type: 'drone',
	width: 6, height: 4,
	speed: 130, steerForce: 12, steerForceBonus: 0.6,
	maxShields: 0, contactDamage: 1,
	searchRange: DEFAULT_SEARCH_RANGE,
	timeToRegenerateShields: 1, damageCooldown: 0.2,
	velocityX: 0, attacks: true, interpolate: true, bounciness: 1,
};
