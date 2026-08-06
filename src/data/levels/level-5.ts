import type { LevelConfig } from './types';
import type { Config } from '@/game/components';
import { PLAYER_COLOR, ENEMY_COLOR } from '@/data/colors';
import { factionCollision } from '@/data/collide-categories';
import { PLAYER_START_SHIPS } from './player-start';

// Act II - Escalation (levels 5-9): the enemy stops being a pure Skiff rush and starts fielding armed types, a
// second station, and a bigger map, so raw ramming no longer settles a level on its own.  Level 5 opens the act
// gently: the Act-I Skiff wall, now backed by a pair of Gunners - the first enemy that kills at range, chipping
// the player's fleet before it can close.  Field still the compact portrait of Act I; it grows from level 6 on.
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
