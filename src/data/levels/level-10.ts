import type { LevelConfig } from './types';
import type { Config } from '@/game/components';
import { PLAYER_COLOR, ENEMY_COLOR } from '@/data/colors';
import { factionCollision } from '@/data/collide-categories';
import { PLAYER_START_SHIPS } from './player-start';

// Act III - Fortress: tanks and snipers at steep levels, so fights are attrition against armour. Level 10 is the
// pure fortress - a pair of levelled Bulwarks behind a Gunner battery - which sells the Railgun and Detonator.
const WIDTH = 500;
const HEIGHT = 840;
const MARGIN = 110;

export const level10: LevelConfig = {
	name: 'level-10',
	title: 'Rampart',
	bounds: { width: WIDTH, height: HEIGHT },
	nextLevel: 'level-11',
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
				skiff: { rate: 7, level: 6 },
				gunner: { rate: 5, level: 5 },
				bulwark: { rate: 2, level: 5 },
				detonator: { rate: 2, level: 2 },
			},
		} satisfies Config,
	],
};
