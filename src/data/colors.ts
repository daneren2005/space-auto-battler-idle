// Single source of truth for faction colours (Phaser-style 24-bit RGB ints); levels reference these by name.
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

// The colours as a list, for callers handing out one per faction (multi-faction levels, generated scenes).
export const FACTION_PALETTE: Array<number> = Object.values(FACTION_COLORS);

// The nth faction colour, wrapping once the palette runs out.
export function factionColor(index: number): number {
	return FACTION_PALETTE[Math.abs(Math.trunc(index)) % FACTION_PALETTE.length];
}
