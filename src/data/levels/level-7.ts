import type { LevelConfig } from './types';
import type { Config } from '@/game/components';
import { PLAYER_COLOR, ENEMY_COLOR } from '@/data/colors';
import { factionCollision } from '@/data/collide-categories';
import { PLAYER_START_SHIPS } from './player-start';

// Act II: the enemy's first shielded tank (a low-level Bulwark) fronts the Skiff-and-Gunner line, teaching the
// player to invest in a type that out-damages armour rather than ramming.
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
				skiff: { rate: 4, level: 5 },
				gunner: { rate: 3, level: 3 },
				bulwark: { rate: 1, level: 2 },
			},
		} satisfies Config,
	],
};
