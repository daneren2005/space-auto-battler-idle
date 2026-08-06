import type { LevelConfig } from './types';
import type { Config } from '@/game/components';
import { PLAYER_COLOR, ENEMY_COLOR } from '@/data/colors';
import { factionCollision } from '@/data/collide-categories';
import { PLAYER_START_SHIPS } from './player-start';

// Act III finale (see level-10.ts): a THIRD enemy station opens across the top - armour on the left, a sniper nest
// in the centre, a mixed battery on the right - so pressure now comes down three lanes at once and the player can
// hold none of them passively.  All three bases are the one allied red faction, ganging up rather than fighting
// each other.  It is the bridge into Act IV: the onslaught's multi-front shape, at levels a fully built fleet can
// still just beat, before Act IV pushes past what an un-prestiged run can.
const WIDTH = 580;
const HEIGHT = 960;
const MARGIN = 120;
// Three bases spread across the top edge, so their lanes cover the left, centre and right of the field.
const LEFT_X = Math.round(WIDTH * 0.2);
const CENTER_X = Math.round(WIDTH * 0.5);
const RIGHT_X = Math.round(WIDTH * 0.8);

export const level14: LevelConfig = {
	name: 'level-14',
	title: 'Overrun',
	bounds: { width: WIDTH, height: HEIGHT },
	nextLevel: 'level-15',
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
				railgunLancer: { rate: 2, level: 4 },
			},
		} satisfies Config,
		{
			type: 'station',
			x: RIGHT_X,
			y: MARGIN,
			color: ENEMY_COLOR,
			...factionCollision(1),
			ships: {
				gunner: { rate: 4, level: 4 },
				scatterGun: { rate: 2, level: 3 },
			},
		} satisfies Config,
	],
};
