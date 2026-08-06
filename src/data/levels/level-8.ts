import type { LevelConfig } from './types';
import type { Config } from '@/game/components';
import { PLAYER_COLOR, ENEMY_COLOR } from '@/data/colors';
import { factionCollision } from '@/data/collide-categories';
import { PLAYER_START_SHIPS } from './player-start';

// Act II (see level-5.ts): the enemy splits into TWO stations for the first time, set at the top-left and
// top-right so the player can no longer hold a single centre choke - fire comes down both flanks at once.  Both
// enemy stations share faction 1 (and the red enemy colour): they are one allied force with two production bases,
// so their ships never fight each other and every hull they build converges on the player.  The new threat is the
// Wasp - tiny, very fast, evasive swarm skirmishers - which a slow ramming line struggles to catch; this is the
// level that argues for a homing type (Missile Frigate) or a spread type (Scatter Gun) that punishes a swarm.
const WIDTH = 460;
const HEIGHT = 760;
const MARGIN = 100;
// The two enemy bases sit a little in from the top corners, so their fleets sweep down the left and right lanes.
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
