// Single source of truth for ship types. Per-faction spawn state is laid out by `SHIP_TYPE_INDEX`, so the key
// set must stay stable and dense. Adding a type here is most of what it takes to field it (see plans/03).

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

// Position of each type in the fixed per-faction arrays: declaration order.
export const SHIP_TYPE_INDEX: Record<ShipType, number> = Object.fromEntries(
	SHIP_TYPES.map((type, index) => [type, index]),
) as Record<ShipType, number>;

export const SHIP_TYPE_COUNT = SHIP_TYPES.length;

const SHIP_TYPE_SET: ReadonlySet<string> = new Set(SHIP_TYPES);
export function isShipType(type: string): type is ShipType {
	return SHIP_TYPE_SET.has(type);
}

// Omitted for pure rammers. A volley is `projectileCount` shots fanned across `spread` radians; `spawnsDrones`
// launches drone sub-ships instead of projectiles (the Carrier).
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
	// Weave across the target's front while firing instead of holding still (Missile Frigate).
	strafe?: boolean
	// Noun the upgrade card uses for these shots (Bullet / Pellet / ...).
	projectileNoun?: string
}

// Which stat a progression track grows. `projectiles` covers a volley's shot count and a Carrier's drone count.
export type ProgressionStat = 'shields' | 'damage' | 'projectiles';

// One stat growing on a cadence: `+amount` (default 1) every `every` levels. `phase` (default 1) picks which
// levels grant - `phase 1` grants at level 1+every, 1+2*every, ... (the "every N-th level past the first" feel,
// matching the old floor((level-1)/N) default); use `phase 0` with `every 2` to grant on the even levels so two
// tracks can alternate (the Detonator: damage on even levels, shields on odd).
export interface ProgressionTrack {
	stat: ProgressionStat
	every: number
	amount?: number
	phase?: number
}

export interface ShipTypeDef {
	name: string
	sprite: string
	// Hull: front-to-back length (width) x beam (height).
	width: number
	height: number
	speed: number
	steerForce: number
	// Optional per-ship random turn bonus so no two of a type turn at the same radius.
	steerBonus?: number
	// Shields at level 1 (0 = dies to the first hit until levelled up).
	baseShields: number
	// Ram damage (0 = keeps its distance).
	contactDamage: number
	// Per-ship level-up schedule: each track grows one stat on its own cadence, so a ship's identity comes through
	// as it levels (Gunner damage every level, Missile Frigate a shot every level, the Detonator alternating, ...).
	// Level 0 is locked, level 1 is the base ship; the tracks only add from level 2 up.
	progression: Array<ProgressionTrack>
	weapon?: WeaponDef
	// If set, explodes on contact across `blastRadius` and dies (the Detonator).
	detonateOnContact?: { blastRadius: number }
	// Stamped onto each ship's combat block at spawn so collision code needn't re-derive the type.
	killReward: number
	// cost = base * growth ** timesBought. `unlockCost` buys the first rate of a locked type.
	unlockCost: number
	rateCostBase: number
	rateCostGrowth: number
	levelCostBase: number
	levelCostGrowth: number
}

// How many times a track has fired by `level`: the count of levels L in [2, level] with L congruent to phase mod
// every. Closed form off the first qualifying level so it stays O(1) (called per spawn in the worker).
function grantsForTrack(level: number, every: number, phase = 1): number {
	if(level <= 1) {
		return 0;
	}
	const residue = ((phase % every) + every) % every;
	let first = 2 + ((residue - 2) % every + every) % every;
	if(first > level) {
		return 0;
	}
	return Math.floor((level - first) / every) + 1;
}

function statBonusForLevel(def: ShipTypeDef, level: number, stat: ProgressionStat): number {
	let total = 0;
	for(const track of def.progression) {
		if(track.stat === stat) {
			total += grantsForTrack(level, track.every, track.phase) * (track.amount ?? 1);
		}
	}
	return total;
}

export function shieldsForLevel(def: ShipTypeDef, level: number): number {
	return def.baseShields + statBonusForLevel(def, level, 'shields');
}

export function contactDamageForLevel(def: ShipTypeDef, level: number): number {
	return def.contactDamage + statBonusForLevel(def, level, 'damage');
}

export function weaponDamageForLevel(def: ShipTypeDef, level: number): number {
	if(!def.weapon) {
		return 0;
	}
	return def.weapon.damage + statBonusForLevel(def, level, 'damage');
}

// A volley's shot count (or a Carrier's drones per launch) scaled by its `projectiles` tracks. Safe for any weapon.
export function projectileCountForLevel(def: ShipTypeDef, level: number): number {
	const base = def.weapon?.projectileCount ?? 1;
	if(!def.weapon) {
		return base;
	}
	return base + statBonusForLevel(def, level, 'projectiles');
}

// The type's headline offensive stat, as a label + value in its own terms.
export function combatStat(def: ShipTypeDef, level: number): { label: string, value: number } {
	if(def.weapon?.spawnsDrones) {
		return { label: 'Drones/launch', value: projectileCountForLevel(def, level) };
	}
	if(def.weapon) {
		return { label: `${def.weapon.projectileNoun ?? 'Shot'} damage`, value: weaponDamageForLevel(def, level) };
	}
	if(def.detonateOnContact) {
		return { label: 'Blast damage', value: contactDamageForLevel(def, level) };
	}
	return { label: 'Ram damage', value: contactDamageForLevel(def, level) };
}

// Short summary of what buying the next Level grants.
export function nextLevelSummary(def: ShipTypeDef, level: number): string {
	const next = level + 1;
	const parts: string[] = [];

	const shieldGain = shieldsForLevel(def, next) - shieldsForLevel(def, level);
	if(shieldGain > 0) {
		parts.push(`+${shieldGain} shield${shieldGain === 1 ? '' : 's'}`);
	}

	// A grown volley reads in its own terms: a Carrier's drones, else the weapon's shot noun (missile/pellet/arc).
	const countGain = projectileCountForLevel(def, next) - projectileCountForLevel(def, level);
	if(countGain > 0) {
		const noun = def.weapon?.spawnsDrones ? 'drone' : (def.weapon?.projectileNoun ?? 'shot').toLowerCase();
		parts.push(`+${countGain} ${noun}${countGain === 1 ? '' : 's'}`);
	}

	// A drone-spawner has no per-shot damage to grow, so only non-spawners report a damage step.
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

// Every curve is exponential: cost = base * growth ** bought (bought is kept per type on the hangar).

export function unlockCost(def: ShipTypeDef): number {
	return def.unlockCost;
}

export function killReward(def: ShipTypeDef): number {
	return def.killReward;
}

export function rateCost(def: ShipTypeDef, rateBought: number): number {
	return def.rateCostBase * def.rateCostGrowth ** rateBought;
}

export function levelCost(def: ShipTypeDef, levelBought: number): number {
	return def.levelCostBase * def.levelCostGrowth ** levelBought;
}

// The always-unlocked Skiff has no unlock price to anchor against, so it uses cheap flat bases.
const SKIFF_ECONOMY = {
	rateCostBase: 10,
	rateCostGrowth: 2,
	levelCostBase: 5,
	levelCostGrowth: 2,
};

// Derived from unlock cost so pricier ships cost more to improve. Unlock leaves both bought counters at 1, so
// rate base = unlock cost and level base = half makes the first level cost the unlock price, the first rate twice it.
function tierEconomy(cost: number) {
	return {
		rateCostBase: cost,
		rateCostGrowth: 2,
		levelCostBase: cost / 2,
		levelCostGrowth: 2,
	};
}

export const SHIP_TYPE_DEFS: Record<ShipType, ShipTypeDef> = {
	// Cheap, fast, disposable rammer. The starter, so no unlock cost.
	skiff: {
		name: 'Skiff',
		sprite: 'ships/skiff.png',
		width: 10, height: 5,
		speed: 100, steerForce: 10, steerBonus: 0.5,
		baseShields: 0, contactDamage: 1,
		progression: [{ stat: 'shields', every: 1 }, { stat: 'damage', every: 4 }],
		killReward: 1,
		unlockCost: 0, ...SKIFF_ECONOMY,
	},
	// Straight-shot corvette: single medium-range bullet.
	gunner: {
		name: 'Gunner',
		sprite: 'ships/gunner.png',
		width: 12, height: 8,
		speed: 80, steerForce: 8, steerBonus: 0.2,
		baseShields: 1, contactDamage: 0,
		// A dedicated gun: damage climbs every level, with only an occasional shield.
		progression: [{ stat: 'damage', every: 1 }, { stat: 'shields', every: 3 }],
		weapon: { range: 120, fireInterval: 0.6, projectileCount: 1, projectileSpeed: 260, damage: 1, projectileNoun: 'Bullet' },
		killReward: 2,
		unlockCost: 40, ...tierEconomy(40),
	},
	// Homing swarm: fragile, strafes across the enemy's front raining homing missiles.
	missileFrigate: {
		name: 'Missile Frigate',
		sprite: 'ships/missile-frigate.png',
		width: 16, height: 10,
		speed: 60, steerForce: 3, steerBonus: 0.4,
		baseShields: 0, contactDamage: 0,
		// A swarm: one more missile every level, an occasional shield, and its per-missile damage only every 4th.
		progression: [{ stat: 'projectiles', every: 1 }, { stat: 'shields', every: 3 }, { stat: 'damage', every: 4 }],
		weapon: { range: 160, fireInterval: 1.4, projectileCount: 3, spread: 0.3, projectileSpeed: 160, damage: 1, homing: true, strafe: true, projectileNoun: 'Missile' },
		killReward: 3,
		unlockCost: 160, ...tierEconomy(160),
	},
	// Long-range glass cannon: one very-high-damage slug, long reload, shieldless.
	railgunLancer: {
		name: 'Railgun Lancer',
		sprite: 'ships/railgun-lancer.png',
		width: 18, height: 6,
		speed: 45, steerForce: 2.5, steerBonus: 0.1,
		baseShields: 0, contactDamage: 0,
		// Ever-heavier slug: damage every level, with only an occasional shield to keep it glassy.
		progression: [{ stat: 'damage', every: 1 }, { stat: 'shields', every: 3 }],
		weapon: { range: 260, fireInterval: 3, projectileCount: 1, projectileSpeed: 500, damage: 6, projectileNoun: 'Slug' },
		killReward: 4,
		unlockCost: 280, ...tierEconomy(280),
	},
	// AoE kamikaze: explodes on contact across a blast radius, then dies.
	detonator: {
		name: 'Detonator',
		sprite: 'ships/detonator.png',
		width: 12, height: 12,
		speed: 90, steerForce: 9, steerBonus: 0.5,
		baseShields: 0, contactDamage: 4,
		// Alternates each level: a bigger blast on the even levels, another shield on the odd.
		progression: [{ stat: 'damage', every: 2, phase: 0 }, { stat: 'shields', every: 2, phase: 1 }],
		detonateOnContact: { blastRadius: 40 },
		killReward: 4,
		unlockCost: 220, ...tierEconomy(220),
	},
	// Shield tank: lots of shields (and extra per level), a short-range light gun.
	bulwark: {
		name: 'Bulwark',
		sprite: 'ships/bulwark.png',
		width: 20, height: 16,
		speed: 50, steerForce: 2.5, steerBonus: 0.2,
		baseShields: 6, contactDamage: 2,
		// Wall: two shields every level, a little damage every 4th.
		progression: [{ stat: 'shields', every: 1, amount: 2 }, { stat: 'damage', every: 4 }],
		weapon: { range: 40, fireInterval: 1, projectileCount: 1, projectileSpeed: 200, damage: 1, projectileNoun: 'Bullet' },
		killReward: 5,
		unlockCost: 300, ...tierEconomy(300),
	},
	// Rapid swarm skirmisher: very fast and tiny, rapid short-range pellets.
	wasp: {
		name: 'Wasp Interceptor',
		sprite: 'ships/wasp.png',
		width: 8, height: 6,
		speed: 140, steerForce: 14, steerBonus: 0.6,
		baseShields: 0, contactDamage: 0,
		// Pure glass: damage every level and never a shield - it lives or dies on speed.
		progression: [{ stat: 'damage', every: 1 }],
		weapon: { range: 60, fireInterval: 0.25, projectileCount: 1, projectileSpeed: 220, damage: 1, projectileNoun: 'Pellet' },
		killReward: 2,
		unlockCost: 120, ...tierEconomy(120),
	},
	// Shotgun / anti-swarm: many low-damage pellets in a short-range spread.
	scatterGun: {
		name: 'Scatter Gun',
		sprite: 'ships/scatter-gun.png',
		width: 14, height: 10,
		speed: 70, steerForce: 7, steerBonus: 0.1,
		baseShields: 1, contactDamage: 0,
		// A widening spread: one more pellet every level, its per-pellet damage and a shield only occasionally.
		progression: [{ stat: 'projectiles', every: 1 }, { stat: 'damage', every: 3 }, { stat: 'shields', every: 3 }],
		weapon: { range: 80, fireInterval: 0.9, projectileCount: 5, spread: 0.5, projectileSpeed: 200, damage: 1, projectileNoun: 'Pellet' },
		killReward: 3,
		unlockCost: 190, ...tierEconomy(190),
	},
	// Chain / multi-hit: three short-range homing arcs each seek a target.
	stormcaller: {
		name: 'Stormcaller',
		sprite: 'ships/stormcaller.png',
		width: 14, height: 12,
		speed: 65, steerForce: 1, steerBonus: 0.5,
		baseShields: 2, contactDamage: 0,
		// Alternates arcs and power: another arc on the odd levels, more per-arc damage on the even, a rare shield.
		progression: [{ stat: 'projectiles', every: 2, phase: 1 }, { stat: 'damage', every: 2, phase: 0 }, { stat: 'shields', every: 3 }],
		weapon: { range: 90, fireInterval: 1.1, projectileCount: 3, spread: 0.8, projectileSpeed: 240, damage: 1, homing: true, homingTurn: 45, projectileNoun: 'Arc' },
		killReward: 5,
		unlockCost: 360, ...tierEconomy(360),
	},
	// Spawner: its "weapon" launches drone sub-ships instead of projectiles, gaining a drone every level.
	carrier: {
		name: 'Carrier',
		sprite: 'ships/carrier.png',
		width: 24, height: 18,
		speed: 40, steerForce: 0.5, steerBonus: 0.03,
		baseShields: 3, contactDamage: 0,
		// A growing flight deck: a new drone every level, with two shields every 3rd to offset the swarm.
		progression: [{ stat: 'projectiles', every: 1 }, { stat: 'shields', every: 3, amount: 2 }],
		weapon: { range: 220, fireInterval: 2.5, projectileCount: 2, spread: 0.6, projectileSpeed: 120, damage: 0, spawnsDrones: true },
		killReward: 8,
		unlockCost: 550, ...tierEconomy(550),
	},
};
