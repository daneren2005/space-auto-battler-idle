import type { LevelConfig } from './types';
import type { Config } from '@/game/components';
import { PLAYER_COLOR, ENEMY_COLOR } from '@/data/colors';
import { factionCollision } from '@/data/collide-categories';
import { PLAYER_START_SHIPS } from './player-start';

// Act I - Skirmish: Skiffs only, rising in rate and level, teaching rate vs. level against a single threat.
const WIDTH = 360;
const HEIGHT = 640;
const MARGIN = 80;

// Enemy pushes rate ahead of level: four level-3 Skiffs a second, the first level that really wants a rate upgrade.
export const level3: LevelConfig = {
	name: 'level-3',
	title: 'Probe',
	bounds: { width: WIDTH, height: HEIGHT },
	nextLevel: 'level-4',
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
			ships: { skiff: { rate: 4, level: 4 } },
		} satisfies Config,
	],
};
