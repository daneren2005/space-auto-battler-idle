import { describe, it, expect } from 'vitest';
import {
	DISPLAY_WIDTH,
	DISPLAY_HEIGHT,
	HUD_TOP_HEIGHT,
	HUD_BOTTOM_HEIGHT,
	playAreaViewport,
} from '../display';

describe('display', () => {
	it('is portrait so the game fits a phone screen', () => {
		expect(DISPLAY_HEIGHT).toBeGreaterThan(DISPLAY_WIDTH);
	});

	it('leaves the play area between the two HUD bands', () => {
		const viewport = playAreaViewport(DISPLAY_WIDTH, DISPLAY_HEIGHT);

		expect(viewport).toEqual({
			x: 0,
			y: HUD_TOP_HEIGHT,
			width: DISPLAY_WIDTH,
			height: DISPLAY_HEIGHT - HUD_TOP_HEIGHT - HUD_BOTTOM_HEIGHT,
		});
		// Nothing the camera draws can reach the top text or the bottom buttons.
		expect(viewport.y).toBe(HUD_TOP_HEIGHT);
		expect(viewport.y + viewport.height).toBe(DISPLAY_HEIGHT - HUD_BOTTOM_HEIGHT);
	});

	it('still leaves the play area taller than it is wide, so a portrait level zooms to fill it', () => {
		const viewport = playAreaViewport(DISPLAY_WIDTH, DISPLAY_HEIGHT);
		expect(viewport.height).toBeGreaterThan(viewport.width);
	});

	it('never returns a negative height when the canvas is shorter than the HUD bands', () => {
		expect(playAreaViewport(320, 100).height).toBe(0);
	});
});
