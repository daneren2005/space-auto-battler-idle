import type { Config } from '@/game/components';
import { DEFAULT_SEARCH_RANGE } from '@/game/components/attack';

// A drone: the tiny sub-ship a Carrier's weapon launches instead of a projectile (see weapon-update).  It is a
// full ship - it targets, steers and rams like a Wasp - but it is not a station-buildable `ShipType`, so it has
// no catalog entry or level scaling; it always spawns at these fixed stats.  Fast, fragile and cheap to field in
// numbers, it is the compounding board presence a Carrier trades its slow, expensive hull for.  Its `owner` and
// the collide category + mask it inherits from the Carrier are supplied per spawn, along with a launch heading.
export const droneConfig: Config = {
	type: 'drone',
	width: 6, height: 4,
	speed: 130, steerForce: 12, steerForceBonus: 0.6,
	maxShields: 0, contactDamage: 1,
	searchRange: DEFAULT_SEARCH_RANGE,
	timeToRegenerateShields: 1, damageCooldown: 0.2,
	velocityX: 0, attacks: true, interpolate: true, bounciness: 1,
};
