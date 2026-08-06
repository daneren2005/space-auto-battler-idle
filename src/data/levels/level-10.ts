import type { LevelConfig } from './types';
import type { Config } from '@/game/components';
import { PLAYER_COLOR, ENEMY_COLOR } from '@/data/colors';
import { factionCollision } from '@/data/collide-categories';
import { PLAYER_START_SHIPS } from './player-start';

// Act III - Fortress (levels 10-14): the enemy fields tanks and snipers at steeply climbing levels, so the fights
// are now attrition against armour rather than races to out-spawn.  Level 10 is the pure fortress: a pair of
// levelled Bulwarks - a rolling shield wall soaking everything - behind a Gunner battery.  Chipping through this
// with Skiffs alone is hopeless; it is the level that sells the Railgun (one heavy slug per Bulwark) and the
// Detonator (blast that ignores the shield-per-hit trade).  A single centre station, but a very hard one.
const WIDTH = 500;
const HEIGHT = 840;
const MARGIN = 110;

export const level10: LevelConfig = {
	name: 'level-10',
	title: 'Rampart',
	bounds: { width: WIDTH, height: HEIGHT },
	nextLevel: 'level-11',
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
				bulwark: { rate: 2, level: 4 },
				gunner: { rate: 3, level: 4 },
			},
		} satisfies Config,
	],
};
