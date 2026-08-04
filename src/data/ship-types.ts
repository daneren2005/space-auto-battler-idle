// The catalog of ship types a station can build.  This is the single source of truth for what distinguishes one
// ship type from another - its hull, how it fights, how it scales with level, and what it costs to unlock and
// upgrade.  Systems and entity templates address a type by its `ShipType` key, and per-faction spawn state is
// laid out by `SHIP_TYPE_INDEX`, so the key set must stay stable and dense.
//
// Every buildable type is turned into an entity template by the shared factory in data/entities/ship.ts, so
// adding a type here (and to SHIP_TYPES) is most of what it takes to field it - the projectile, weapon, spawn
// and collision systems already execute whatever a def describes.  All numbers are starting-point tuning
// relative to the Skiff baseline; see plans/03-ship-roster.md for the design intent behind each type.

export const SHIP_TYPES = [
	'skiff',
	'gunner',
	'missileFrigate',
	'railgunLancer',
	'detonator',
	'bulwark',
	'wasp',
	'scatterGun',
	'stormcaller',
	'carrier',
] as const;
export type ShipType = typeof SHIP_TYPES[number];

// Position of each type in the fixed per-faction arrays a station carries (rate + level + progress per type).
// Dense and stable: 0, 1, 2, ... in declaration order.
export const SHIP_TYPE_INDEX: Record<ShipType, number> = Object.fromEntries(
	SHIP_TYPES.map((type, index) => [type, index]),
) as Record<ShipType, number>;

export const SHIP_TYPE_COUNT = SHIP_TYPES.length;

// Whether a factory template name (an entity's `entity.type`) is one of the buildable ship types - so the scene
// can tell a ship, which has a per-type silhouette, from a station / drone / projectile that does not.
const SHIP_TYPE_SET: ReadonlySet<string> = new Set(SHIP_TYPES);
export function isShipType(type: string): type is ShipType {
	return SHIP_TYPE_SET.has(type);
}

// A ship type's weapon.  Omitted for pure rammers.  A volley is `projectileCount` shots fanned across `spread`
// radians, each flying at `projectileSpeed`; `homing` shots steer toward the target at `homingTurn`.  A weapon
// that `spawnsDrones` launches drone sub-ships instead of projectiles (the Carrier), reusing the fire cadence.
export interface WeaponDef {
	range: number
	fireInterval: number
	projectileCount?: number
	spread?: number
	projectileSpeed: number
	damage: number
	homing?: boolean
	homingTurn?: number
	spawnsDrones?: boolean
	// The word the upgrade UI uses for this weapon's shots - a Gunner fires "bullets", a Scatter Gun "pellets" - so
	// each ship's card names its damage in its own terms instead of the generic "projectile".  Omitted for a weapon
	// that spawns drones (the Carrier), which the card describes by drone count rather than per-shot damage.
	projectileNoun?: string
}

// What one ship type is made of: its hull, how it deals damage (ram and/or weapon), how level scales it, and its
// upgrade economy (consumed by the upgrade UI in a later phase).
export interface ShipTypeDef {
	// Display name, for the upgrade UI.
	name: string
	// The white top-down silhouette a ship of this type is drawn with, tinted per faction at runtime (public/ships/;
	// see plans/05-assets.md).  Held as a key here so the art can be swapped without touching any system - GameScene
	// loads it under the type's key and dressSprite selects it by the entity's type.
	sprite: string
	// Hull: front-to-back length (width) x beam (height), top speed in px/s, and how hard it steers toward a
	// target - with an optional per-ship random bonus on top, so no two of a type turn at quite the same radius.
	width: number
	height: number
	speed: number
	steerForce: number
	steerBonus?: number
	// Shields it spawns with at level 1 (0 = dies to the first hit until levelled up).
	baseShields: number
	// Damage it deals by ramming an enemy (0 = it does not ram for damage - an armed ship that keeps its distance).
	contactDamage: number
	// The level upgrade scales both durability and damage.  Each level past the first adds `shieldsPerLevel`
	// shields (default 1), and every `levelsPerDamage` levels adds one to damage (default 4) - applied to whichever
	// damage source the type uses, contact or weapon.  Level 0 means locked (a station builds none of it); level 1
	// is the base, unlocked ship.
	shieldsPerLevel?: number
	levelsPerDamage?: number
	// Its weapon, if any.
	weapon?: WeaponDef
	// If set, the ship explodes on contact instead of ramming, dealing its contact damage to everything within
	// `blastRadius` and dying (the Detonator).
	detonateOnContact?: { blastRadius: number }
	// Upgrade economy (cost = base * growth ** timesBought).  `unlockCost` buys the first rate of a locked type.
	unlockCost: number
	rateCostBase: number
	rateCostGrowth: number
	levelCostBase: number
	levelCostGrowth: number
}

// The shields a ship of this type spawns with at a given upgrade level: its base plus a flat amount per level
// past the first.  Level 0 (locked) and level 1 both give the base.
export function shieldsForLevel(def: ShipTypeDef, level: number): number {
	if(level <= 1) {
		return def.baseShields;
	}
	return def.baseShields + (level - 1) * (def.shieldsPerLevel ?? 1);
}

// The extra damage a level grants past the first: one for every `levelsPerDamage` levels earned, so damage steps
// up on a slower cadence than shields.  Added to whichever base a type's damage comes from (contact or weapon).
function damageBonusForLevel(def: ShipTypeDef, level: number): number {
	if(level <= 1) {
		return 0;
	}
	return Math.floor((level - 1) / (def.levelsPerDamage ?? 4));
}

// The contact (ram) damage a ship of this type deals at a given level.
export function contactDamageForLevel(def: ShipTypeDef, level: number): number {
	return def.contactDamage + damageBonusForLevel(def, level);
}

// The per-shot weapon damage a ship of this type deals at a given level (0 for a type with no weapon).
export function weaponDamageForLevel(def: ShipTypeDef, level: number): number {
	if(!def.weapon) {
		return 0;
	}
	return def.weapon.damage + damageBonusForLevel(def, level);
}

// --- Upgrade-card copy ----------------------------------------------------------------------------------------
// Turns a type's def into the offence line and next-level preview its upgrade card shows, so the UI can name each
// ship's damage in its own terms and spell out exactly what the next Level buy grants.

// The one offensive stat most worth showing for a type, as a label + value: an armed ship shows its per-shot damage
// under its own noun (Bullet / Missile / Pellet / ...), a Carrier the count of drones each launch fields (it deals
// no direct damage of its own), a Detonator its blast, and an unarmed rammer (the Skiff) its ram damage.
export function combatStat(def: ShipTypeDef, level: number): { label: string, value: number } {
	if(def.weapon?.spawnsDrones) {
		return { label: 'Drones/launch', value: def.weapon.projectileCount ?? 1 };
	}
	if(def.weapon) {
		return { label: `${def.weapon.projectileNoun ?? 'Shot'} damage`, value: weaponDamageForLevel(def, level) };
	}
	if(def.detonateOnContact) {
		return { label: 'Blast damage', value: contactDamageForLevel(def, level) };
	}
	return { label: 'Ram damage', value: contactDamageForLevel(def, level) };
}

// A short human summary of what buying the next Level grants a type from its current level: always the shields it
// adds, plus - on the slower damage cadence, and only for a type whose damage scales - a point of damage.  A
// Carrier gains only shields (its drones fly at fixed stats), so its preview reads "+N shields".
export function nextLevelSummary(def: ShipTypeDef, level: number): string {
	const next = level + 1;
	const parts: string[] = [];

	const shieldGain = shieldsForLevel(def, next) - shieldsForLevel(def, level);
	if(shieldGain > 0) {
		parts.push(`+${shieldGain} shield${shieldGain === 1 ? '' : 's'}`);
	}

	// A Carrier's drones carry fixed stats, so a level buys it no damage - skip the damage term entirely for it.
	if(!def.weapon?.spawnsDrones) {
		const damageGain = def.weapon
			? weaponDamageForLevel(def, next) - weaponDamageForLevel(def, level)
			: contactDamageForLevel(def, next) - contactDamageForLevel(def, level);
		if(damageGain > 0) {
			parts.push(`+${damageGain} damage`);
		}
	}

	return parts.length ? parts.join(', ') : 'No further gains';
}

// --- Upgrade economy ------------------------------------------------------------------------------------------
// A type's price for the player's three actions, all pure functions of the def plus how many upgrades of that kind
// have already been bought (kept per type on the hangar).  Every curve is exponential - cost = base * growth **
// bought - so each purchase is a meaningful step up, matching the shape the single-type UI used before the roster.

// What it costs to unlock a locked type (buy its first rate).  A flat one-off; the rate/level curves take over
// from the base once it is built.  The always-available Skiff has unlockCost 0.
export function unlockCost(def: ShipTypeDef): number {
	return def.unlockCost;
}

// The next rate upgrade's cost, given how many rate upgrades this type has already had.  bought 0 (a freshly built
// type, or the Skiff's base line) is the cheapest, at rateCostBase.
export function rateCost(def: ShipTypeDef, rateBought: number): number {
	return def.rateCostBase * def.rateCostGrowth ** rateBought;
}

// The next level upgrade's cost, given how many level upgrades this type has already had.
export function levelCost(def: ShipTypeDef, levelBought: number): number {
	return def.levelCostBase * def.levelCostGrowth ** levelBought;
}

// Shared upgrade-economy defaults, so a def only spells out what makes it more or less expensive than the norm.
const ECONOMY = {
	rateCostBase: 10,
	rateCostGrowth: 2,
	levelCostBase: 5,
	levelCostGrowth: 2,
};

export const SHIP_TYPE_DEFS: Record<ShipType, ShipTypeDef> = {
	// 1. Skiff - the basic ship: cheap, fast, disposable.  Rams for one, no shields until levelled.  Always the
	// starter, so it has no unlock cost.
	skiff: {
		name: 'Skiff',
		sprite: 'ships/skiff.png',
		width: 10, height: 5,
		speed: 100, steerForce: 10, steerBonus: 0.5,
		baseShields: 0, contactDamage: 1,
		unlockCost: 0, ...ECONOMY,
	},
	// 2. Gunner - straight-shot corvette: the first thing unlocked, introduces bullets.  Keeps its distance
	// (contact damage 0) and fires a single medium-range bullet; starts with a shield.
	gunner: {
		name: 'Gunner',
		sprite: 'ships/gunner.png',
		width: 12, height: 8,
		speed: 80, steerForce: 8, steerBonus: 0.5,
		baseShields: 1, contactDamage: 0,
		weapon: { range: 120, fireInterval: 0.6, projectileCount: 1, projectileSpeed: 260, damage: 1, projectileNoun: 'Bullet' },
		unlockCost: 40, ...ECONOMY,
	},
	// 3. Missile Frigate - homing swarm: a volley of low-damage homing missiles, medium-long range, fragile and
	// slow, no shields until upgraded.
	missileFrigate: {
		name: 'Missile Frigate',
		sprite: 'ships/missile-frigate.png',
		width: 16, height: 10,
		speed: 60, steerForce: 6, steerBonus: 0.5,
		baseShields: 0, contactDamage: 0,
		weapon: { range: 160, fireInterval: 1.4, projectileCount: 3, spread: 0.3, projectileSpeed: 160, damage: 1, homing: true, projectileNoun: 'Missile' },
		unlockCost: 120, ...ECONOMY,
	},
	// 4. Railgun Lancer - long-range glass cannon: one very-high-damage straight slug, very long range and reload,
	// slow and shieldless.  Needs to acquire targets far past ram range (its weapon range drives its search).
	railgunLancer: {
		name: 'Railgun Lancer',
		sprite: 'ships/railgun-lancer.png',
		width: 18, height: 6,
		speed: 45, steerForce: 5, steerBonus: 0.5,
		baseShields: 0, contactDamage: 0,
		weapon: { range: 260, fireInterval: 3, projectileCount: 1, projectileSpeed: 500, damage: 6, projectileNoun: 'Slug' },
		unlockCost: 200, rateCostBase: 20, rateCostGrowth: 2, levelCostBase: 12, levelCostGrowth: 2,
	},
	// 5. Detonator - AoE kamikaze: no weapon, explodes on contact for high damage across a blast radius, then
	// dies.  Medium speed, no shields.
	detonator: {
		name: 'Detonator',
		sprite: 'ships/detonator.png',
		width: 12, height: 12,
		speed: 90, steerForce: 9, steerBonus: 0.5,
		baseShields: 0, contactDamage: 4,
		detonateOnContact: { blastRadius: 40 },
		unlockCost: 160, ...ECONOMY,
	},
	// 6. Bulwark - shield tank: lots of shields (and extra per level), slow, a short-range light gun; a moving
	// wall that soaks fire and still chips in a little damage by ram or bullet.
	bulwark: {
		name: 'Bulwark',
		sprite: 'ships/bulwark.png',
		width: 20, height: 16,
		speed: 50, steerForce: 5, steerBonus: 0.3,
		baseShields: 6, contactDamage: 2, shieldsPerLevel: 2,
		weapon: { range: 70, fireInterval: 1, projectileCount: 1, projectileSpeed: 200, damage: 1, projectileNoun: 'Bullet' },
		unlockCost: 220, rateCostBase: 20, rateCostGrowth: 2, levelCostBase: 8, levelCostGrowth: 2,
	},
	// 7. Wasp Interceptor - rapid swarm skirmisher: very fast and tiny, rapid short-range pellets, no shields.
	wasp: {
		name: 'Wasp Interceptor',
		sprite: 'ships/wasp.png',
		width: 8, height: 6,
		speed: 140, steerForce: 14, steerBonus: 0.6,
		baseShields: 0, contactDamage: 0,
		weapon: { range: 60, fireInterval: 0.25, projectileCount: 1, projectileSpeed: 220, damage: 1, projectileNoun: 'Pellet' },
		unlockCost: 90, ...ECONOMY,
	},
	// 8. Scatter Gun - shotgun / anti-swarm: many low-damage pellets in a spread, short range, one shield to start.
	scatterGun: {
		name: 'Scatter Gun',
		sprite: 'ships/scatter-gun.png',
		width: 14, height: 10,
		speed: 70, steerForce: 7, steerBonus: 0.5,
		baseShields: 1, contactDamage: 0,
		weapon: { range: 80, fireInterval: 0.9, projectileCount: 5, spread: 0.5, projectileSpeed: 200, damage: 1, projectileNoun: 'Pellet' },
		unlockCost: 140, ...ECONOMY,
	},
	// 9. Stormcaller - chain / multi-hit arc: short range, its volley of three short-range homing arcs each seeks a
	// target, approximating a shot that hits several nearby enemies at once.  Medium shields.
	stormcaller: {
		name: 'Stormcaller',
		sprite: 'ships/stormcaller.png',
		width: 14, height: 12,
		speed: 65, steerForce: 6, steerBonus: 0.5,
		baseShields: 2, contactDamage: 0,
		weapon: { range: 90, fireInterval: 1.1, projectileCount: 3, spread: 0.8, projectileSpeed: 240, damage: 1, homing: true, homingTurn: 45, projectileNoun: 'Arc' },
		unlockCost: 260, rateCostBase: 20, rateCostGrowth: 2, levelCostBase: 10, levelCostGrowth: 2,
	},
	// 10. Carrier - spawner: big, slow, some shields; its "weapon" periodically launches tiny drone sub-ships
	// instead of projectiles (see weapon-update).  A mobile mini-station and force multiplier.
	carrier: {
		name: 'Carrier',
		sprite: 'ships/carrier.png',
		width: 24, height: 18,
		speed: 40, steerForce: 4, steerBonus: 0.3,
		baseShields: 3, contactDamage: 0, shieldsPerLevel: 2,
		weapon: { range: 220, fireInterval: 2.5, projectileCount: 2, spread: 0.6, projectileSpeed: 120, damage: 0, spawnsDrones: true },
		unlockCost: 400, rateCostBase: 40, rateCostGrowth: 2, levelCostBase: 20, levelCostGrowth: 2,
	},
};
