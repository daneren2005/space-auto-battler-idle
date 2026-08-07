import type { LevelConfig } from './types';
import type { Config } from '@/game/components';
import { PLAYER_COLOR, ENEMY_COLOR } from '@/data/colors';
import { factionCollision } from '@/data/collide-categories';
import { PLAYER_START_SHIPS } from './player-start';

const WIDTH = 360;
const HEIGHT = 640;
const MARGIN = 80;

// Ups the enemy baseline to a level-2 Skiff line at 3/s (one shield apiece), so its fleet is bigger and tankier
// than level 1. The player keeps the shared start (player-start), not a raised base, so only the enemy escalates.
export const level2: LevelConfig = {
	name: 'level-2',
	title: 'Escalation',
	bounds: { width: WIDTH, height: HEIGHT },
	nextLevel: 'level-3',
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
			ships: { skiff: { rate: 3, level: 2 } },
		} satisfies Config,
	],
};
