import type { Config } from '@/game/components';
import { SHIP_TYPE_DEFS, type ShipType } from '@/data/ship-types';
import { DEFAULT_SEARCH_RANGE } from '@/game/components/attack';

// Turns a ship type's def (ship-types.ts) into an entity template. Every buildable ship is built the same way -
// the per-type numbers all live in its def - so this one factory stands in for ten hand-written templates. The
// stats here are the level-1 base a directly-placed ship uses; a spawned one is stamped with its station's level.
export function makeShipConfig(type: ShipType): Config {
	const def = SHIP_TYPE_DEFS[type];
	const config: Config = {
		type,
		width: def.width, height: def.height,
		speed: def.speed, steerForce: def.steerForce, steerForceBonus: def.steerBonus,
		maxShields: def.baseShields, contactDamage: def.contactDamage,
		// Kill reward is fixed per type (doesn't scale with level), so it rides on the template.
		bounty: def.killReward,
		searchRange: Math.max(DEFAULT_SEARCH_RANGE, def.weapon?.range ?? 0),
		timeToRegenerateShields: 1, damageCooldown: 0.2,
		velocityX: 0, attacks: true, interpolate: true, bounciness: 1,
	};

	if(def.detonateOnContact) {
		config.blastRadius = def.detonateOnContact.blastRadius;
	}
	if(def.weapon) {
		config.weapon = def.weapon;
		// An armed ship holds at its weapon range instead of ramming; a rammer has no weapon and no standoff.
		config.standoffRange = def.weapon.range;
		if(def.weapon.strafe) {
			config.strafe = true;
		}
	}

	return config;
}
