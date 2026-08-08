import type { LevelConfig } from './types';
import type { Config } from '@/game/components';
import { PLAYER_COLOR, ENEMY_COLOR } from '@/data/colors';
import { factionCollision } from '@/data/collide-categories';
import { PLAYER_START_SHIPS } from './player-start';

// Act III finale: a third enemy station opens across the top (armour left, sniper centre, mixed battery right,
// all one allied faction), so pressure comes down three lanes at once. The bridge into Act IV.
const WIDTH = 580;
const HEIGHT = 960;
const MARGIN = 120;
const LEFT_X = Math.round(WIDTH * 0.2);
const CENTER_X = Math.round(WIDTH * 0.5);
const RIGHT_X = Math.round(WIDTH * 0.8);

export const level14: LevelConfig = {
	name: 'level-14',
	title: 'Overrun',
	bounds: { width: WIDTH, height: HEIGHT },
	nextLevel: 'level-15',
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
				bulwark: { rate: 2, level: 5 },
				detonator: { rate: 2, level: 3 },
			},
		} satisfies Config,
		{
			type: 'station',
			x: CENTER_X,
			y: MARGIN,
			color: ENEMY_COLOR,
			...factionCollision(1),
			ships: {
				gunner: { rate: 5, level: 6 },
				railgunLancer: { rate: 2, level: 5 },
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
				scatterGun: { rate: 3, level: 3 },
				detonator: { rate: 2, level: 3 },
			},
		} satisfies Config,
	],
};
