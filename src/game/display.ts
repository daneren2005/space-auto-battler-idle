// The game renders into a fixed-resolution canvas (this size), independent of how big a level's world bounds
// are.  Scale.FIT then fits that canvas into the page.  The GameScene's camera zooms to fit the level's bounds
// inside the play area (a small level zooms in, a big level zooms out), so changing a level's size never changes
// the size of the HUD/menus drawn by the UIScene - they are always laid out against these dimensions.
// The canvas is portrait (a 9:16-ish phone shape) so the game is playable one-handed on mobile.
export const DISPLAY_WIDTH = 720;
export const DISPLAY_HEIGHT = 1280;

// The landscape canvas the /stress-test page runs on.  That page is desktop-only on purpose, and its level is a
// wide one - fitting a wide world into the portrait canvas above would zoom it down to an unreadably thin strip,
// so the stress test flips the canvas instead.  The HUD lays itself out against whatever canvas it is given, so
// nothing else has to change.
export const WIDE_DISPLAY_WIDTH = 1280;
export const WIDE_DISPLAY_HEIGHT = 720;

// The HUD claims a band at the top (level / money / fleet text) and one at the bottom (the upgrade buttons).
// The battle is confined to the strip between them so a station can never end up hidden behind either.
export const HUD_TOP_HEIGHT = 110;
export const HUD_BOTTOM_HEIGHT = 124;

export interface Viewport {
	x: number
	y: number
	width: number
	height: number
}

// The slice of the canvas the game camera draws into: full width, inset from the top and bottom by the HUD
// bands.  Both scenes derive their layout from this so the play area and the HUD can never disagree.
export function playAreaViewport(width: number, height: number): Viewport {
	return {
		x: 0,
		y: HUD_TOP_HEIGHT,
		width,
		height: Math.max(height - HUD_TOP_HEIGHT - HUD_BOTTOM_HEIGHT, 0),
	};
}
