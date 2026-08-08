import type { LevelConfig } from './types';
import type { Config } from '@/game/components';
import { PLAYER_COLOR, ENEMY_COLOR } from '@/data/colors';
import { factionCollision } from '@/data/collide-categories';
import { PLAYER_START_SHIPS } from './player-start';

// Act III: enemy levels climb steeply (a level-5 Bulwark is near-immovable) and a Stormcaller joins in. The
// hardest two-station fight before Act IV opens a third front.
const WIDTH = 540;
const HEIGHT = 900;
const MARGIN = 120;
const LEFT_X = Math.round(WIDTH * 0.28);
const RIGHT_X = Math.round(WIDTH * 0.72);

export const level13: LevelConfig = {
	name: 'level-13',
	title: 'Deadlock',
	bounds: { width: WIDTH, height: HEIGHT },
	nextLevel: 'level-14',
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
			x: LEFT_X,
			y: MARGIN,
			color: ENEMY_COLOR,
			...factionCollision(1),
			ships: {
				skiff: { rate: 7, level: 6 },
				bulwark: { rate: 3, level: 5 },
				detonator: { rate: 2, level: 3 },
			},
		} satisfies Config,
		{
			type: 'station',
			x: RIGHT_X,
			y: MARGIN,
			color: ENEMY_COLOR,
			...factionCollision(1),
			ships: {
				gunner: { rate: 6, level: 6 },
				railgunLancer: { rate: 2, level: 4 },
				stormcaller: { rate: 2, level: 4 },
			},
		} satisfies Config,
	],
};
