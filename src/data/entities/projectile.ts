import type { Config } from '@/game/components';

// A projectile: a short-lived shot. A `sensor` body passes through everything physically yet still reports
// overlapping an enemy, so the collision code can deal damage and consume it without knocking ships around. It
// has no `health`, which keeps it out of the targeting index so nothing shoots it down. The stats here are just
// defaults; the firing weapon overrides them per shot.
export const projectileConfig: Config = {
	type: 'projectile',
	width: 6, height: 2,
	sensor: true,
	contactDamage: 1,
	remainingLifetime: 2,
	velocityX: 0, interpolate: true,
};
