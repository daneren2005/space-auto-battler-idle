import type { Config } from '@/game/components';

// A station: a big, slow-regenerating hub that banks money and spends it spawning ships.  A `radius` loads a
// circle body 20 across - the same size the sprite is drawn at - so a ship hits it at the same distance from
// whichever side it comes in on.  Its `collideCategory` / `collideMask` come from the level (see
// factionCollision), and its ships inherit them.
//
// No `interpolate`: a station has no velocity, so nothing ever moves it and there is no motion to smooth out.
// Its sprite is drawn straight off the transform, which is what an entity without the component falls back to.
export const stationConfig: Config = { type: 'station', radius: 10, maxShields: 2, timeToRegenerateShields: 5, damageCooldown: 0.2 };
