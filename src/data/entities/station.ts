import type { Config } from '@/game/components';

// A station: a big, slow-regenerating hub that banks money and spends it spawning ships.  A `radius` loads a
// circle body 20 across - the same size the sprite is drawn at - so a ship hits it at the same distance from
// whichever side it comes in on.  Its `collideCategory` / `collideMask` come from the level (see
// factionCollision), and its ships inherit them.
export const stationConfig: Config = { type: 'station', radius: 10, maxShields: 2, timeToRegenerateShields: 5, damageCooldown: 0.2 };
