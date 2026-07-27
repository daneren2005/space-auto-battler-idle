import type { LevelConfig } from './types';

// Faction colours (match the palette in generate-scene).
const PLAYER_COLOR = 0x2962ff; // blue
const ENEMY_COLOR = 0xd50000; // red

// Same compact playing field as level 1 (see level-1.ts for how bounds map to the camera); later levels can
// widen these to open the battle up.
const WIDTH = 640;
const HEIGHT = 360;
const MARGIN = 80;

// The second level ups the baseline: both factions field 6 ships and their ships carry 1 shield, so fights are
// bigger and ships tankier than level 1's one-hit skirmishes.  Stations sit on the left / right edges, both
// vertically centred.  The player also brings whatever openShip / shield upgrades they bought in level 1
// (applied on top of these bases by the scene), so it should be beatable with a decently upgraded fleet but a
// fresh, un-upgraded run would be an even coin-flip.
export const level2: LevelConfig = {
	name: 'level-2',
	title: 'Escalation',
	bounds: { width: WIDTH, height: HEIGHT },
	entities: [
		{
			type: 'station',
			x: MARGIN,
			y: HEIGHT / 2,
			color: PLAYER_COLOR,
			player: true,
			openShips: 6,
			shipShields: 1,
		},
		{
			type: 'station',
			x: WIDTH - MARGIN,
			y: HEIGHT / 2,
			color: ENEMY_COLOR,
			openShips: 6,
			shipShields: 1,
		},
	],
};
