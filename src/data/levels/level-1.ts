import type { LevelConfig } from './types';

// Faction colours (match the palette in generate-scene).
const PLAYER_COLOR = 0x2962ff; // blue
const ENEMY_COLOR = 0xd50000; // red

// The playing field is deliberately small so ships cross it quickly; later levels bump these up (the display
// is a fixed size and the game camera zooms to fit whatever bounds a level uses, so a bigger map zooms out
// rather than growing the canvas or the UI).
const WIDTH = 640;
const HEIGHT = 360;
const MARGIN = 80;

// The starting level: the player's station sits on the left edge and a single enemy station on the right, both
// vertically centred so their fleets meet in the middle.  Each faction starts with 2 openShips (two ship
// slots) and 0 shields, so ships die in a single hit and kills come quickly.
export const level1: LevelConfig = {
	name: 'level-1',
	title: 'First Contact',
	bounds: { width: WIDTH, height: HEIGHT },
	nextLevel: 'level-2',
	entities: [
		{
			type: 'station',
			x: MARGIN,
			y: HEIGHT / 2,
			color: PLAYER_COLOR,
			player: true,
			openShips: 2,
			shipShields: 0,
		},
		{
			type: 'station',
			x: WIDTH - MARGIN,
			y: HEIGHT / 2,
			color: ENEMY_COLOR,
			openShips: 2,
			shipShields: 0,
		},
	],
};
