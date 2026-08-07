import type { LevelConfig } from './types';
import type { Config } from '@/game/components';
import { PLAYER_COLOR, ENEMY_COLOR } from '@/data/colors';
import { factionCollision } from '@/data/collide-categories';
import { PLAYER_START_SHIPS } from './player-start';

// Act III: both fortress fronts thicken - the armour side doubles Bulwarks and adds a Wasp swarm, the sniper side
// backs its Railgun with a Scatter Gun. Every archetype is now on the field at once, so the fleet must be broad.
const WIDTH = 540;
const HEIGHT = 900;
const MARGIN = 120;
const LEFT_X = Math.round(WIDTH * 0.28);
const RIGHT_X = Math.round(WIDTH * 0.72);

export const level12: LevelConfig = {
	name: 'level-12',
	title: 'Redoubt',
	bounds: { width: WIDTH, height: HEIGHT },
	nextLevel: 'level-13',
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
				bulwark: { rate: 2, level: 4 },
				wasp: { rate: 3, level: 3 },
			},
		} satisfies Config,
		{
			type: 'station',
			x: RIGHT_X,
			y: MARGIN,
			color: ENEMY_COLOR,
			...factionCollision(1),
			ships: {
				railgunLancer: { rate: 1, level: 4 },
				scatterGun: { rate: 2, level: 3 },
			},
		} satisfies Config,
	],
};
