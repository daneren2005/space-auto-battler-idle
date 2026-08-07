// Fixed-resolution canvas, independent of a level's world bounds; Scale.FIT fits it to the page and the camera
// zooms to the level. Portrait (9:16-ish) so the game is playable one-handed on mobile.
export const DISPLAY_WIDTH = 720;
export const DISPLAY_HEIGHT = 1280;

// The landscape canvas for the desktop-only /stress-test page, whose wide level would zoom to a thin strip in
// the portrait canvas above.
export const WIDE_DISPLAY_WIDTH = 1280;
export const WIDE_DISPLAY_HEIGHT = 720;

// HUD bands at top (level / money / fleet) and bottom (upgrade buttons); the battle is confined between them.
export const HUD_TOP_HEIGHT = 110;
export const HUD_BOTTOM_HEIGHT = 124;

export interface Viewport {
	x: number
	y: number
	width: number
	height: number
}

// The slice the game camera draws into, inset by the HUD bands. Both scenes derive from this so they can't disagree.
export function playAreaViewport(width: number, height: number): Viewport {
	return {
		x: 0,
		y: HUD_TOP_HEIGHT,
		width,
		height: Math.max(height - HUD_TOP_HEIGHT - HUD_BOTTOM_HEIGHT, 0),
	};
}
