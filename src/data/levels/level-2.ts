import type { LevelConfig } from './types';
import { PLAYER_COLOR, ENEMY_COLOR } from '@/data/colors';
import { factionCollision } from '@/data/collide-categories';

// Same compact portrait playing field as level 1 (see level-1.ts for how bounds map to the camera); later
// levels can grow these to open the battle up.
const WIDTH = 360;
const HEIGHT = 640;
const MARGIN = 80;

// The second level ups the baseline: both factions launch 3 ships a second and their ships carry 1 shield, so
// fights are bigger and ships tankier than level 1's one-hit skirmishes.  The player holds the bottom edge and
// the enemy the top, both horizontally centred.  The player also brings whatever ship-rate / shield upgrades
// they bought in level 1 (applied on top of these bases by the scene), so it should be beatable with a decently
// upgraded fleet but a fresh, un-upgraded run would be an even coin-flip.
export const level2: LevelConfig = {
	name: 'level-2',
	title: 'Escalation',
	bounds: { width: WIDTH, height: HEIGHT },
	entities: [
		{
			type: 'station',
			x: WIDTH / 2,
			y: HEIGHT - MARGIN,
			color: PLAYER_COLOR,
			...factionCollision(0),
			player: true,
			shipsPerSecond: 3,
			shipShields: 1,
		},
		{
			type: 'station',
			x: WIDTH / 2,
			y: MARGIN,
			color: ENEMY_COLOR,
			...factionCollision(1),
			shipsPerSecond: 3,
			shipShields: 1,
		},
	],
};
