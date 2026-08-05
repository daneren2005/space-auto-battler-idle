import type { LevelConfig } from './types';
import type { Config } from '@/game/components';
import { PLAYER_COLOR, ENEMY_COLOR } from '@/data/colors';
import { factionCollision } from '@/data/collide-categories';
import { PLAYER_START_SHIPS } from './player-start';

// The playing field is deliberately small so ships cross it quickly, and portrait so it fills the tall mobile
// canvas; later levels bump these up (the display is a fixed size and the game camera zooms to fit whatever
// bounds a level uses, so a bigger map zooms out rather than growing the canvas or the UI).
const WIDTH = 360;
const HEIGHT = 640;
const MARGIN = 80;

// The starting level: the player's station sits at the bottom - nearest the upgrade buttons they tap - and a
// single enemy station at the top, both horizontally centred so their fleets meet in the middle.  Each faction
// builds a single Skiff line at one ship a second, level 1 - the base, unlocked Skiff with no shields - so ships
// die in a single hit and kills come quickly, and with the two sides on the same rate the player only pulls ahead
// by buying upgrades.  factionCollision gives each station (and so its ships) a collide category of its own, which
// is what keeps a faction's own ships from running into each other.
export const level1: LevelConfig = {
	name: 'level-1',
	title: 'First Contact',
	bounds: { width: WIDTH, height: HEIGHT },
	nextLevel: 'level-2',
	entities: [
		{
			type: 'station',
			x: WIDTH / 2,
			y: HEIGHT - MARGIN,
			color: PLAYER_COLOR,
			...factionCollision(0),
			player: true,
			// The player's starting fleet, shared by every level so it carries forward unchanged (see player-start).
			ships: PLAYER_START_SHIPS,
		} satisfies Config,
		{
			type: 'station',
			x: WIDTH / 2,
			y: MARGIN,
			color: ENEMY_COLOR,
			...factionCollision(1),
			ships: { skiff: { rate: 1, level: 1 } },
		} satisfies Config,
	],
};
