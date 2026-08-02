import type { LevelConfig } from './types';
import type { Config } from '@/game/components';
import { FACTION_PALETTE } from '@/data/colors';
import { factionCollision } from '@/data/collide-categories';

// A benchmark battle rather than a campaign level: every colour in the palette fields a faction, each pouring
// out ships far faster than they can die, so the engine is asked to simulate thousands of them colliding at
// once and the load keeps climbing for as long as the page is left open.  It is deliberately left out
// of `levels` (data/levels/index.ts) - it has no place in the play order, it never advances anywhere, and the
// campaign's shape (a portrait field with exactly two stations) does not apply to it.  It is reached by opening
// the /stress-test page, which boots it on a landscape canvas; see src/stress-test.ts.
const WIDTH = 2400;
const HEIGHT = 900;
// Far enough in from the edges that a station never sits on the boundary its own ships bounce off.  It is also
// what sets how far apart the two rows are: at this margin they end up the same distance apart as the stations
// within a row, so every faction is equally close to its neighbours either side and the one opposite, and the
// fighting fills the middle of the map as well as the rows.
const MARGIN = 200;
// How fast each faction launches ships.  Nothing caps the fleet any more, so this is the whole dial: the ship
// count climbs at FACTIONS x this per second minus however many are dying, until the frame rate gives out.
const SHIPS_PER_SECOND_PER_FACTION = 200;

// One faction per palette colour, so a colour added to (or removed from) data/colors.ts changes the size of the
// stress test with it.  factionCollision caps out at MAX_FACTIONS (32), well above the palette.
const FACTIONS = FACTION_PALETTE.length;

// The stations are laid out as two facing rows - the first half along the bottom edge, the rest along the top -
// evenly spaced across the full width.  Every faction gets a neighbour either side and one opposite, so the
// fighting spreads over the whole map instead of collapsing into one melee in the middle.
const COLUMNS = Math.ceil(FACTIONS / 2);
const COLUMN_SPACING = COLUMNS > 1 ? (WIDTH - 2 * MARGIN) / (COLUMNS - 1) : 0;

// Which column each faction takes within its row, ordered from the middle outwards.  That puts faction 0 - the
// player - in the middle of the bottom row, nearest the upgrade buttons, the way they hold the bottom edge of a
// campaign level, and fills the rows outwards from there however many factions there turn out to be.
const MIDDLE_COLUMN = (COLUMNS - 1) / 2;
const COLUMN_ORDER = [...Array(COLUMNS).keys()]
	.sort((left, right) => Math.abs(left - MIDDLE_COLUMN) - Math.abs(right - MIDDLE_COLUMN));

export const stressTestLevel: LevelConfig = {
	name: 'stress-test',
	title: 'Stress Test',
	bounds: { width: WIDTH, height: HEIGHT },
	entities: FACTION_PALETTE.map((color, faction): Config => {
		// Row 0 is the bottom edge (Phaser's y grows downwards), row 1 the top.
		const row = Math.floor(faction / COLUMNS);
		const column = COLUMN_ORDER[faction % COLUMNS];

		return {
			type: 'station',
			x: Math.round(COLUMNS > 1 ? MARGIN + column * COLUMN_SPACING : WIDTH / 2),
			y: row === 0 ? HEIGHT - MARGIN : MARGIN,
			color,
			...factionCollision(faction),
			player: faction === 0,
			shipsPerSecond: SHIPS_PER_SECOND_PER_FACTION,
			// A shield apiece so ships survive their first hit and the fight stays crowded instead of thinning out
			// the moment the fleets meet.
			shipShields: 1,
		};
	}),
};

export { SHIPS_PER_SECOND_PER_FACTION, FACTIONS as STRESS_TEST_FACTIONS };
