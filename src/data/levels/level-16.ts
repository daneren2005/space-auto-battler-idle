import type { LevelConfig } from './types';
import type { Config } from '@/game/components';
import { PLAYER_COLOR, ENEMY_COLOR } from '@/data/colors';
import { factionCollision } from '@/data/collide-categories';
import { PLAYER_START_SHIPS } from './player-start';

// Act IV finale - the last level a maxed un-prestiged run can still grind out. Three combined-arms bases on a big
// field; a lean fleet loses, but a fully upgraded one clears it. Act V (level 17+) is where the fleets climb past
// that ceiling and a Singularity's Ascendancy bonuses become the only way through.
const WIDTH = 660;
const HEIGHT = 1080;
const MARGIN = 140;
const LEFT_X = Math.round(WIDTH * 0.2);
const CENTER_X = Math.round(WIDTH * 0.5);
const RIGHT_X = Math.round(WIDTH * 0.8);

export const level16: LevelConfig = {
	name: 'level-16',
	title: 'Event Horizon',
	bounds: { width: WIDTH, height: HEIGHT },
	nextLevel: 'level-17',
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
				skiff: { rate: 8, level: 6 },
				bulwark: { rate: 3, level: 6 },
				carrier: { rate: 1, level: 5 },
			},
		} satisfies Config,
		{
			type: 'station',
			x: CENTER_X,
			y: MARGIN,
			color: ENEMY_COLOR,
			...factionCollision(1),
			ships: {
				gunner: { rate: 7, level: 6 },
				railgunLancer: { rate: 3, level: 5 },
				stormcaller: { rate: 2, level: 5 },
			},
		} satisfies Config,
		{
			type: 'station',
			x: RIGHT_X,
			y: MARGIN,
			color: ENEMY_COLOR,
			...factionCollision(1),
			ships: {
				skiff: { rate: 8, level: 6 },
				bulwark: { rate: 3, level: 6 },
				detonator: { rate: 3, level: 3 },
			},
		} satisfies Config,
	],
};
