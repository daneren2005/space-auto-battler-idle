import type { LevelConfig } from './types';
import type { Config } from '@/game/components';
import { PLAYER_COLOR, ENEMY_COLOR } from '@/data/colors';
import { factionCollision } from '@/data/collide-categories';
import { PLAYER_START_SHIPS } from './player-start';

// Act I - Skirmish (levels 1-4): the enemy fields only Skiffs, rising in rate and level, so the player learns the
// core loop - rate (more ships) vs. level (tougher ships) - against a single, legible threat before any new type
// enters.  Same compact portrait field as levels 1-2 (see level-1.ts for how bounds map to the camera).
const WIDTH = 360;
const HEIGHT = 640;
const MARGIN = 80;

// The enemy pushes rate ahead of level here: four Skiffs a second at level 3 (two shields apiece) is a steady
// stream the player can no longer clear by rate alone with their starting one-a-second line - the first level
// that really wants a rate upgrade or two, and the first taste of shielded ships surviving a single ram.
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
