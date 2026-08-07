import type { Config } from '@/game/components';

// A station: a slow-regenerating hub that banks money and spawns ships. A `radius` loads a circle body so a ship
// hits it at the same distance from any side. Its collide category/mask come from the level and its ships inherit
// them. No `interpolate`: it never moves, so its sprite draws straight off the transform.
export const stationConfig: Config = { type: 'station', radius: 10, maxShields: 2, timeToRegenerateShields: 5, damageCooldown: 0.2 };
