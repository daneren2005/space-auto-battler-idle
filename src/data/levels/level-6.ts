import type { LevelConfig } from './types';
import type { Config } from '@/game/components';
import { PLAYER_COLOR, ENEMY_COLOR } from '@/data/colors';
import { factionCollision } from '@/data/collide-categories';
import { PLAYER_START_SHIPS } from './player-start';

// Act II (see level-5.ts): the map takes its first step up - a wider, taller field that opens more room for the
// enemy's ranged fire to matter and gives the player somewhere to manoeuvre - while the Gunner escort thickens to
// three at level 3.  The bigger bounds zoom the camera out a little, which is the visible signal that the fight
// is broadening from the Act-I skirmish.
const WIDTH = 400;
const HEIGHT = 700;
const MARGIN = 90;

export const level6: LevelConfig = {
	name: 'level-6',
	title: 'Crossfire',
	bounds: { width: WIDTH, height: HEIGHT },
	nextLevel: 'level-7',
	entities: [
		{
			type: 'station',
			x: WIDTH / 2,
			y: HEIGHT - MARGIN,
			color: PLAYER_COLOR,
			...factionCollision(0),
			player: true,
			ships: PLAYER_START_SHIPS,
		} satisfies Config,
		{
			type: 'station',
			x: WIDTH / 2,
			y: MARGIN,
			color: ENEMY_COLOR,
			...factionCollision(1),
			ships: {
				skiff: { rate: 5, level: 5 },
				gunner: { rate: 3, level: 3 },
			},
		} satisfies Config,
	],
};
