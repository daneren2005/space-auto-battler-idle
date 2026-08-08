import type { LevelConfig } from './types';
import type { Config } from '@/game/components';
import { PLAYER_COLOR, ENEMY_COLOR } from '@/data/colors';
import { factionCollision } from '@/data/collide-categories';
import { PLAYER_START_SHIPS } from './player-start';

// Act IV finale - the wall. Three maxed combined-arms bases on the biggest field, deliberately tuned to be
// UNBEATABLE by an un-prestiged run: the intended stopping point that motivates the Singularity reset. No
// `nextLevel` - until prestige exists, winning it just rolls back to a fresh run.
const WIDTH = 660;
const HEIGHT = 1080;
const MARGIN = 140;
const LEFT_X = Math.round(WIDTH * 0.2);
const CENTER_X = Math.round(WIDTH * 0.5);
const RIGHT_X = Math.round(WIDTH * 0.8);

export const level16: LevelConfig = {
	name: 'level-16',
	title: 'Event Horizon',
	bounds: { width: WIDTH, height: HEIGHT },
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
				skiff: { rate: 8, level: 6 },
				bulwark: { rate: 3, level: 6 },
				carrier: { rate: 1, level: 5 },
			},
		} satisfies Config,
		{
			type: 'station',
			x: CENTER_X,
			y: MARGIN,
			color: ENEMY_COLOR,
			...factionCollision(1),
			ships: {
				gunner: { rate: 7, level: 6 },
				railgunLancer: { rate: 3, level: 5 },
				stormcaller: { rate: 2, level: 5 },
			},
		} satisfies Config,
		{
			type: 'station',
			x: RIGHT_X,
			y: MARGIN,
			color: ENEMY_COLOR,
			...factionCollision(1),
			ships: {
				skiff: { rate: 8, level: 6 },
				bulwark: { rate: 3, level: 6 },
				detonator: { rate: 3, level: 3 },
			},
		} satisfies Config,
	],
};
