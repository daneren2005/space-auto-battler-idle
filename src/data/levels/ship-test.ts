import type { LevelConfig } from './types';
import type { Config } from '@/game/components';
import { PLAYER_COLOR, ENEMY_COLOR } from '@/data/colors';
import { factionCollision } from '@/data/collide-categories';
import { SHIP_TYPES, type ShipType } from '@/data/ship-types';

// A showcase battle: a 1v1 where both stations build a couple of every ship type, so each one's weapon/homing/
// blast/drones can be watched against a live enemy. Left out of `levels`; reached via the /ship-test page on a
// landscape canvas, so the fleets face off left vs right along its long axis.
const WIDTH = 1100;
const HEIGHT = 560;
const MARGIN = 130;

// One line per type. Level is bumped up so every type survives long enough to close, fire, and show what it does.
const RATE_PER_TYPE = 1;
const LEVEL_PER_TYPE = 4;

// Every type at the same rate + level. Shared between both stations (each hangar copies it on load, read-only).
const roster: Partial<Record<ShipType, { rate: number, level: number }>> = {};
for(const type of SHIP_TYPES) {
	roster[type] = { rate: RATE_PER_TYPE, level: LEVEL_PER_TYPE };
}

export const shipTestLevel: LevelConfig = {
	name: 'ship-test',
	title: 'Ship Test',
	bounds: { width: WIDTH, height: HEIGHT },
	entities: [
		{
			type: 'station',
			x: MARGIN,
			y: HEIGHT / 2,
			color: PLAYER_COLOR,
			...factionCollision(0),
			player: true,
			// Starting money so the roster UI can be tried out on the spot.
			money: 2000,
			ships: roster,
		} satisfies Config,
		{
			type: 'station',
			x: WIDTH - MARGIN,
			y: HEIGHT / 2,
			color: ENEMY_COLOR,
			...factionCollision(1),
			ships: roster,
		} satisfies Config,
	],
};

export { RATE_PER_TYPE as SHIP_TEST_RATE_PER_TYPE, LEVEL_PER_TYPE as SHIP_TEST_LEVEL_PER_TYPE };
