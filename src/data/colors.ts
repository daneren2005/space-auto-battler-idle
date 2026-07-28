// The single source of truth for faction colours.  Levels (and generateScene) reference these by name instead
// of re-declaring hex literals, so a faction looks the same in every level it appears in and a palette tweak
// only has to happen here.  Colours are Phaser-style 24-bit RGB ints.
export const FACTION_COLORS = {
	player: 0x2962ff, // blue
	enemy: 0xd50000, // red
	neutral: 0xffffff, // white
	orange: 0xff6d00,
	lime: 0x76ff03,
	violet: 0xaa00ff,
	cyan: 0x77e8de,
	sand: 0xf3e28d,
	pink: 0xde62ab,
	jade: 0x39ab62,
} as const;

export type FactionName = keyof typeof FACTION_COLORS;

export const PLAYER_COLOR = FACTION_COLORS.player;
export const ENEMY_COLOR = FACTION_COLORS.enemy;

// The same colours as a list, in declaration order, for callers that need to hand out one colour per faction
// without caring which is which (multi-faction levels, generated scenes).
export const FACTION_PALETTE: Array<number> = Object.values(FACTION_COLORS);

// Picks the nth faction colour, wrapping around once the palette runs out so any number of factions gets a
// colour rather than an undefined.
export function factionColor(index: number): number {
	return FACTION_PALETTE[Math.abs(Math.trunc(index)) % FACTION_PALETTE.length];
}
