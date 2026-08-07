import type { LevelConfig } from './types';
import type { Config } from '@/game/components';
import { PLAYER_COLOR, ENEMY_COLOR } from '@/data/colors';
import { factionCollision } from '@/data/collide-categories';
import { PLAYER_START_SHIPS } from './player-start';

// Act IV - Onslaught: the largest maps and the full roster at high level. Level 15 introduces the Carrier, whose
// drone front regenerates unless it's killed. Three allied bases; the last level winnable by a maxed un-prestiged run.
const WIDTH = 620;
const HEIGHT = 1020;
const MARGIN = 130;
const LEFT_X = Math.round(WIDTH * 0.2);
const CENTER_X = Math.round(WIDTH * 0.5);
const RIGHT_X = Math.round(WIDTH * 0.8);

export const level15: LevelConfig = {
	name: 'level-15',
	title: 'Armada',
	bounds: { width: WIDTH, height: HEIGHT },
	nextLevel: 'level-16',
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
				carrier: { rate: 1, level: 3 },
				bulwark: { rate: 1, level: 4 },
			},
		} satisfies Config,
		{
			type: 'station',
			x: CENTER_X,
			y: MARGIN,
			color: ENEMY_COLOR,
			...factionCollision(1),
			ships: {
				railgunLancer: { rate: 2, level: 4 },
				stormcaller: { rate: 1, level: 3 },
			},
		} satisfies Config,
		{
			type: 'station',
			x: RIGHT_X,
			y: MARGIN,
			color: ENEMY_COLOR,
			...factionCollision(1),
			ships: {
				bulwark: { rate: 2, level: 4 },
				wasp: { rate: 4, level: 3 },
			},
		} satisfies Config,
	],
};
