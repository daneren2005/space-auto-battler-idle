import type { LevelConfig } from './types';
import type { Config } from '@/game/components';
import { PLAYER_COLOR, ENEMY_COLOR } from '@/data/colors';
import { factionCollision } from '@/data/collide-categories';
import { PLAYER_START_SHIPS } from './player-start';

// Act II: the map takes its first step up; a Skiff line with a small Gunner escort. Kept clearly winnable on a
// lean fleet because it's the grind-back level for the level-7 wall - a loss on 7 drops the player here to farm.
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
				skiff: { rate: 5, level: 4 },
				gunner: { rate: 2, level: 3 },
			},
		} satisfies Config,
	],
};
