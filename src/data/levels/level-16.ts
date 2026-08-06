import type { LevelConfig } from './types';
import type { Config } from '@/game/components';
import { PLAYER_COLOR, ENEMY_COLOR } from '@/data/colors';
import { factionCollision } from '@/data/collide-categories';
import { PLAYER_START_SHIPS } from './player-start';

// Act IV finale - the wall (see level-15.ts for the act).  Three allied bases on the biggest field, each a maxed
// combined-arms fleet: a Carrier-and-Bulwark flagship that regenerates its own front, a Railgun-and-Stormcaller
// sniper nest, and an armour-and-Gunner battery, all at the top of their level curves.  This is deliberately tuned
// to be UNBEATABLE by an un-prestiged run: it is the intended stopping point, the pinch that motivates the
// Singularity reset once Phase 6 lands.  It has no `nextLevel` - until prestige exists, winning it (which should
// take prestige bonuses) just rolls the campaign back to a fresh run via the win dialog's "Play Again".
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
				carrier: { rate: 1, level: 4 },
				bulwark: { rate: 2, level: 5 },
			},
		} satisfies Config,
		{
			type: 'station',
			x: CENTER_X,
			y: MARGIN,
			color: ENEMY_COLOR,
			...factionCollision(1),
			ships: {
				railgunLancer: { rate: 2, level: 5 },
				stormcaller: { rate: 2, level: 4 },
			},
		} satisfies Config,
		{
			type: 'station',
			x: RIGHT_X,
			y: MARGIN,
			color: ENEMY_COLOR,
			...factionCollision(1),
			ships: {
				bulwark: { rate: 3, level: 5 },
				gunner: { rate: 5, level: 5 },
			},
		} satisfies Config,
	],
};
