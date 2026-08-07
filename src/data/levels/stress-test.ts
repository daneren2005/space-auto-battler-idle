import type { LevelConfig } from './types';
import type { Config } from '@/game/components';
import { FACTION_PALETTE } from '@/data/colors';
import { factionCollision } from '@/data/collide-categories';

// A benchmark battle, not a campaign level: every palette colour fields a faction pouring out ships far faster
// than they die, so load climbs for as long as the page is open. Left out of `levels`; reached via the
// /stress-test page on a landscape canvas. Sized to that canvas's play-area aspect so the camera fills it.
const WIDTH = 1800;
const HEIGHT = 700;
// Far enough in that a station never sits on the wall its own ships bounce off; also sets the row spacing so
// every faction is equally close to its neighbours and opposite.
const MARGIN = 200;
// The whole dial: nothing caps the fleet, so the count climbs at FACTIONS x this per second until the frame rate gives out.
const SHIPS_PER_SECOND_PER_FACTION = 200;

// One faction per palette colour, so editing data/colors.ts resizes the stress test. Caps at MAX_FACTIONS (32).
const FACTIONS = FACTION_PALETTE.length;

// Two facing rows (bottom half, top half) evenly spaced across the width, so the fighting spreads over the map.
const COLUMNS = Math.ceil(FACTIONS / 2);
const COLUMN_SPACING = COLUMNS > 1 ? (WIDTH - 2 * MARGIN) / (COLUMNS - 1) : 0;

// Each faction's column, ordered middle-outwards, so faction 0 (the player) sits in the middle of the bottom row.
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
			// Level 2 gives each Skiff a shield, so ships survive their first hit and the fight stays crowded.
			ships: { skiff: { rate: SHIPS_PER_SECOND_PER_FACTION, level: 2 } },
		};
	}),
};

export { SHIPS_PER_SECOND_PER_FACTION, FACTIONS as STRESS_TEST_FACTIONS };
