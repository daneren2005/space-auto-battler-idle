import type { LevelConfig } from './types';
import type { Config } from '@/game/components';
import { PLAYER_COLOR, ENEMY_COLOR } from '@/data/colors';
import { factionCollision } from '@/data/collide-categories';
import { SHIP_TYPES, type ShipType } from '@/data/ship-types';

// A showcase battle rather than a campaign level or a benchmark: a single 1v1 where both stations build a couple
// of every ship type at once, so you can watch each one - its weapon, homing, blast or drones - actually play out
// against a live enemy and confirm it behaves.  Like the stress test it is deliberately left out of `levels`
// (data/levels/index.ts): it never advances anywhere and its shape (both fleets holding the whole roster) is not
// the campaign's.  It is reached by opening the /ship-test page, which boots it on a landscape canvas; see
// src/ship-test.ts.
//
// Unlike the campaign's top/bottom stations, the two here face off left vs right: the canvas is landscape, so the
// fleets travelling along its long axis is what keeps the whole map filled and the ships large enough to make out
// (top/bottom on a wide, short map would zoom everything down into a thin strip up the middle).
const WIDTH = 1100;
const HEIGHT = 560;
const MARGIN = 130;

// One production line per ship type on each station.  The rate is a whole ship a second per type (the hangar rate
// is an integer count of ships/second), and the level is bumped up so every type spawns with enough shields to
// survive a few hits - long enough to close, fire, and show what it does rather than dying to the first shot.
const RATE_PER_TYPE = 1;
const LEVEL_PER_TYPE = 4;

// Every buildable type at the same rate + level, so both fleets field the whole roster.  Shared between the two
// stations (each hangar copies the values into its own block on load, so the shared object is only ever read).
const roster: Partial<Record<ShipType, { rate: number, level: number }>> = {};
for(const type of SHIP_TYPES) {
	roster[type] = { rate: RATE_PER_TYPE, level: LEVEL_PER_TYPE };
}

// The player holds the left edge and the enemy the right, both vertically centred, so the fleets meet across the
// middle of the wide field.
export const shipTestLevel: LevelConfig = {
	name: 'ship-test',
	title: 'Ship Test',
	bounds: { width: WIDTH, height: HEIGHT },
	entities: [
		{
			type: 'station',
			x: MARGIN,
			y: HEIGHT / 2,
			color: PLAYER_COLOR,
			...factionCollision(0),
			player: true,
			// Some starting money so the roster UI's upgrades / re-levelling can be tried out on the spot.
			money: 2000,
			ships: roster,
		} satisfies Config,
		{
			type: 'station',
			x: WIDTH - MARGIN,
			y: HEIGHT / 2,
			color: ENEMY_COLOR,
			...factionCollision(1),
			ships: roster,
		} satisfies Config,
	],
};

export { RATE_PER_TYPE as SHIP_TEST_RATE_PER_TYPE, LEVEL_PER_TYPE as SHIP_TEST_LEVEL_PER_TYPE };
