import type { Config } from '@/game/components';

// A projectile: a small, short-lived shot a ship fires from its weapon.  It is a `sensor` body, which is the
// whole trick that makes it work on the shared-memory-physics collision model: a sensor passes through
// everything physically (it never blocks movement and nothing bounces off it), yet the physics run still
// reports it overlapping an enemy - so the collision code can deal its damage and then consume it without the
// shot knocking ships around or being deflected itself.
//
// `contactDamage` (the combat component) and `remainingLifetime` / `target` / `turn` (the projectile component)
// are all overridden per shot by the firing weapon; the values here are only defaults so the template is valid.
// `velocityX` of 0 loads the velocity component - the real launch heading is supplied per shot - and
// `interpolate` smooths its flight between physics steps the same way a ship's is.  It carries no `bounciness`
// (a sensor never bounces) and no `health` (it is the attacker, and having no health keeps it out of the
// targeting index so nothing tries to shoot it down).  `owner`, the collide category + mask, and a homing shot's
// `target` / `turn` are all supplied at spawn.
export const projectileConfig: Config = {
	type: 'projectile',
	width: 6, height: 2,
	sensor: true,
	contactDamage: 1,
	remainingLifetime: 2,
	velocityX: 0, interpolate: true,
};
