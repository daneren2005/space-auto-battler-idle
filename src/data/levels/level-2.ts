import type { LevelConfig } from './types';
import type { Config } from '@/game/components';
import { PLAYER_COLOR, ENEMY_COLOR } from '@/data/colors';
import { factionCollision } from '@/data/collide-categories';
import { PLAYER_START_SHIPS } from './player-start';

// Same compact portrait playing field as level 1 (see level-1.ts for how bounds map to the camera); later
// levels can grow these to open the battle up.
const WIDTH = 360;
const HEIGHT = 640;
const MARGIN = 80;

// The second level ups the enemy baseline: the enemy builds a Skiff line at 3 ships a second, level 2 - one shield
// apiece (a Skiff gains a shield per level over its shieldless base) - so its fleet is bigger and tankier than
// level 1's one-hit skirmishes.  The player holds the bottom edge and the enemy the top, both horizontally centred.
//
// The player's station keeps the shared starting loadout (player-start), not a raised base: the player carries in
// exactly the fleet they left level 1 with (their bought upgrades rebuilt on top of that same start by the scene),
// so advancing never bumps their fleet for free.  Only the enemy escalates, which is what ramps the difficulty - a
// well-upgraded fleet from level 1 should beat this enemy, an un-upgraded one that scraped through level 1 will
// find it a hard fight.
export const level2: LevelConfig = {
	name: 'level-2',
	title: 'Escalation',
	bounds: { width: WIDTH, height: HEIGHT },
	nextLevel: 'level-3',
	entities: [
		{
			type: 'station',
			x: WIDTH / 2,
			y: HEIGHT - MARGIN,
			color: PLAYER_COLOR,
			...factionCollision(0),
			player: true,
			// Same starting loadout as level 1 so the player's carried fleet is reproduced exactly (see player-start).
			ships: PLAYER_START_SHIPS,
		} satisfies Config,
		{
			type: 'station',
			x: WIDTH / 2,
			y: MARGIN,
			color: ENEMY_COLOR,
			...factionCollision(1),
			ships: { skiff: { rate: 3, level: 2 } },
		} satisfies Config,
	],
};
