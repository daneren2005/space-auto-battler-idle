import type { LevelConfig } from './types';
import type { Config } from '@/game/components';
import { PLAYER_COLOR, ENEMY_COLOR } from '@/data/colors';
import { factionCollision } from '@/data/collide-categories';
import { PLAYER_START_SHIPS } from './player-start';

// Small so ships cross it quickly, portrait to fill the mobile canvas; later levels grow (the camera zooms to fit).
const WIDTH = 360;
const HEIGHT = 640;
const MARGIN = 80;

// The starting level: player station at the bottom (near the buttons), one enemy at the top, both centred so
// their fleets meet in the middle. Both build a single level-1 Skiff line at 1/s, so the player only pulls ahead
// by buying upgrades.
export const level1: LevelConfig = {
	name: 'level-1',
	title: 'First Contact',
	bounds: { width: WIDTH, height: HEIGHT },
	nextLevel: 'level-2',
	entities: [
		{
			type: 'station',
			x: WIDTH / 2,
			y: HEIGHT - MARGIN,
			color: PLAYER_COLOR,
			...factionCollision(0),
			player: true,
			// Shared by every level so it carries forward unchanged (see player-start).
			ships: PLAYER_START_SHIPS,
		} satisfies Config,
		{
			type: 'station',
			x: WIDTH / 2,
			y: MARGIN,
			color: ENEMY_COLOR,
			...factionCollision(1),
			ships: { skiff: { rate: 1, level: 1 } },
		} satisfies Config,
	],
};
