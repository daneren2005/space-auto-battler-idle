import type { LevelConfig } from './types';
import type { Config } from '@/game/components';
import { PLAYER_COLOR, ENEMY_COLOR } from '@/data/colors';
import { factionCollision } from '@/data/collide-categories';
import { PLAYER_START_SHIPS } from './player-start';

// Act II: the campaign's first real wall. A Skiff-and-Gunner line backed by a kamikaze Detonator stream - the
// Detonators leak through a thin screen and blast the 2-shield station outright, so a lean fleet dies here and
// has to grind level 6 for a thicker screen before it can soak them. The first level meant to be lost on sight.
const WIDTH = 400;
const HEIGHT = 700;
const MARGIN = 90;

export const level7: LevelConfig = {
	name: 'level-7',
	title: 'Bastion',
	bounds: { width: WIDTH, height: HEIGHT },
	nextLevel: 'level-8',
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
				skiff: { rate: 6, level: 5 },
				gunner: { rate: 3, level: 4 },
				detonator: { rate: 2, level: 2 },
			},
		} satisfies Config,
	],
};
