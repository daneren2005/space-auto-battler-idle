import type { Config } from '@/game/components';

// A station: a big, slow-regenerating hub that banks money and spends it spawning ships.
export const stationConfig: Config = { type: 'station', width: 20, height: 20, maxShields: 2, timeToRegenerateShields: 5, damageCooldown: 0.2 };
