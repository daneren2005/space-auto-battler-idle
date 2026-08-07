import type { LevelConfig } from './types';
import type { Config } from '@/game/components';
import { PLAYER_COLOR, ENEMY_COLOR } from '@/data/colors';
import { factionCollision } from '@/data/collide-categories';
import { PLAYER_START_SHIPS } from './player-start';

// Act II: the enemy splits into two top-corner stations (both faction 1, so allied), attacking down both flanks.
// The new Wasp - tiny, fast, evasive - argues for a homing (Missile Frigate) or spread (Scatter Gun) type.
const WIDTH = 460;
const HEIGHT = 760;
const MARGIN = 100;
const LEFT_X = Math.round(WIDTH * 0.28);
const RIGHT_X = Math.round(WIDTH * 0.72);

export const level8: LevelConfig = {
	name: 'level-8',
	title: 'Pincer',
	bounds: { width: WIDTH, height: HEIGHT },
	nextLevel: 'level-9',
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
				skiff: { rate: 5, level: 4 },
				wasp: { rate: 2, level: 2 },
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
				gunner: { rate: 3, level: 3 },
			},
		} satisfies Config,
	],
};
