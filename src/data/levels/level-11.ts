import type { LevelConfig } from './types';
import type { Config } from '@/game/components';
import { PLAYER_COLOR, ENEMY_COLOR } from '@/data/colors';
import { factionCollision } from '@/data/collide-categories';
import { PLAYER_START_SHIPS } from './player-start';

// Act III: the fortress splits into two allied flanks - an armour bastion (Bulwark + Skiff screen) and a sniper
// nest (Railgun Lancer) - so the player must crack the wall and outrange the sniper at once.
const WIDTH = 500;
const HEIGHT = 840;
const MARGIN = 110;
const LEFT_X = Math.round(WIDTH * 0.28);
const RIGHT_X = Math.round(WIDTH * 0.72);

export const level11: LevelConfig = {
	name: 'level-11',
	title: 'Siege',
	bounds: { width: WIDTH, height: HEIGHT },
	nextLevel: 'level-12',
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
				bulwark: { rate: 1, level: 4 },
				skiff: { rate: 5, level: 5 },
			},
		} satisfies Config,
		{
			type: 'station',
			x: RIGHT_X,
			y: MARGIN,
			color: ENEMY_COLOR,
			...factionCollision(1),
			ships: {
				railgunLancer: { rate: 1, level: 3 },
				gunner: { rate: 3, level: 4 },
			},
		} satisfies Config,
	],
};
