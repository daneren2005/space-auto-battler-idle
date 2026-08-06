import type { LevelConfig } from './types';
import type { Config } from '@/game/components';
import { PLAYER_COLOR, ENEMY_COLOR } from '@/data/colors';
import { factionCollision } from '@/data/collide-categories';
import { PLAYER_START_SHIPS } from './player-start';

// Act I finale (see level-3.ts for the act): the Skiff line maxes out at five a second, level 4 - three shields
// each and, on the level curve's slower damage cadence, ramming for two.  A pure-Skiff fleet this dense is the
// wall the starter line hits: clearing it reliably wants the player to have banked toward the Gunner unlock (a
// ship that kills at range instead of trading rams), which Act II then leans on.  Field unchanged from Act I.
const WIDTH = 360;
const HEIGHT = 640;
const MARGIN = 80;

export const level4: LevelConfig = {
	name: 'level-4',
	title: 'Vanguard',
	bounds: { width: WIDTH, height: HEIGHT },
	nextLevel: 'level-5',
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
			ships: { skiff: { rate: 6, level: 4 } },
		} satisfies Config,
	],
};
