import type { Config } from '@/game/components';
import { SHIP_TYPE_DEFS, type ShipType } from '@/data/ship-types';
import { DEFAULT_SEARCH_RANGE } from '@/game/components/attack';

// Turns a ship type's catalog entry (ship-types.ts) into an entity template.  Every buildable ship is built the
// same way - the numbers that make one type differ from another all live in its def - so this one factory stands
// in for the ten hand-written templates the roster would otherwise need.  The fields spelled out here are the
// physics / lifecycle wiring every ship shares:
//
//  - It stays a `width` x `height` rectangle body (the default shape for a config with a width and height).
//  - `attacks` opts it into the targeting + steering components; a type that shoots past ram range sees as far as
//    it can shoot (searchRange follows its weapon range) so it can acquire before it is in danger.
//  - `contactDamage` (and `blastRadius`, for a detonator) go on the combat block; a `weapon` def loads the weapon
//    block and makes the ship fire.  `maxShields` / `contactDamage` / weapon `damage` here are only the level-1
//    base a directly-placed ship uses - a spawned one is stamped with the values for its station's current level.
//  - `velocityX` of 0 loads the velocity component (a spawned ship overrides it with a real heading; one placed
//    directly still starts able to move).  `interpolate` gives it a smooth render position between physics steps,
//    and `bounciness` of 1 rebounds it off whatever it runs into.  `steerForceBonus` rolls each ship its own
//    steer force as it spawns.  `owner` and the collide category + mask it inherits are supplied per spawn.
export function makeShipConfig(type: ShipType): Config {
	const def = SHIP_TYPE_DEFS[type];
	const config: Config = {
		type,
		width: def.width, height: def.height,
		speed: def.speed, steerForce: def.steerForce, steerForceBonus: def.steerBonus,
		maxShields: def.baseShields, contactDamage: def.contactDamage,
		// Its kill reward is fixed per type (it does not move with level), so it rides on the template and every
		// ship a station spawns inherits it - the spawn config only overrides what a level changes.
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
		// An armed ship stops charging and holds at its weapon range so it fights from a distance rather than
		// ramming; a strafer weaves across that range instead of freezing (see move-to-target).  A rammer has no
		// weapon and so no standoff - it keeps closing to make contact.
		config.standoffRange = def.weapon.range;
		if(def.weapon.strafe) {
			config.strafe = true;
		}
	}

	return config;
}
