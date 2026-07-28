import type { LevelConfig } from './types';
import { PLAYER_COLOR, ENEMY_COLOR } from '@/data/colors';

// The playing field is deliberately small so ships cross it quickly, and portrait so it fills the tall mobile
// canvas; later levels bump these up (the display is a fixed size and the game camera zooms to fit whatever
// bounds a level uses, so a bigger map zooms out rather than growing the canvas or the UI).
const WIDTH = 360;
const HEIGHT = 640;
const MARGIN = 80;

// The starting level: the player's station sits at the bottom - nearest the upgrade buttons they tap - and a
// single enemy station at the top, both horizontally centred so their fleets meet in the middle.  Each faction
// starts with 2 openShips (two ship slots) and 0 shields, so ships die in a single hit and kills come quickly.
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
			player: true,
			openShips: 2,
			shipShields: 0,
		},
		{
			type: 'station',
			x: WIDTH / 2,
			y: MARGIN,
			color: ENEMY_COLOR,
			openShips: 2,
			shipShields: 0,
		},
	],
};
