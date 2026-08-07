import type { LevelConfig } from './types';
import type { Config } from '@/game/components';
import { PLAYER_COLOR, ENEMY_COLOR } from '@/data/colors';
import { factionCollision } from '@/data/collide-categories';
import { PLAYER_START_SHIPS } from './player-start';

// Act II finale: the two flank stations from level 8, but heavier - a denser Wasp swarm and a levelled Gunner
// battery - so the act's counters are now close to required. The gate into Act III.
const WIDTH = 460;
const HEIGHT = 760;
const MARGIN = 100;
const LEFT_X = Math.round(WIDTH * 0.28);
const RIGHT_X = Math.round(WIDTH * 0.72);

export const level9: LevelConfig = {
	name: 'level-9',
	title: 'Onset',
	bounds: { width: WIDTH, height: HEIGHT },
	nextLevel: 'level-10',
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
				skiff: { rate: 5, level: 5 },
				wasp: { rate: 3, level: 3 },
			},
		} satisfies Config,
		{
			type: 'station',
			x: RIGHT_X,
			y: MARGIN,
			color: ENEMY_COLOR,
			...factionCollision(1),
			ships: {
				skiff: { rate: 4, level: 4 },
				gunner: { rate: 3, level: 4 },
			},
		} satisfies Config,
	],
};
