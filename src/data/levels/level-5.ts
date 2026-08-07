import type { LevelConfig } from './types';
import type { Config } from '@/game/components';
import { PLAYER_COLOR, ENEMY_COLOR } from '@/data/colors';
import { factionCollision } from '@/data/collide-categories';
import { PLAYER_START_SHIPS } from './player-start';

// Act II - Escalation: armed types, a second station, and a bigger map arrive. Level 5 opens gently: the Skiff
// wall backed by a pair of Gunners, the first enemy that kills at range.
const WIDTH = 360;
const HEIGHT = 640;
const MARGIN = 80;

export const level5: LevelConfig = {
	name: 'level-5',
	title: 'Escort',
	bounds: { width: WIDTH, height: HEIGHT },
	nextLevel: 'level-6',
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
				gunner: { rate: 2, level: 2 },
			},
		} satisfies Config,
	],
};
