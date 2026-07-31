import { describe, it, expect } from 'vitest';
import {
	DISPLAY_WIDTH,
	DISPLAY_HEIGHT,
	WIDE_DISPLAY_WIDTH,
	WIDE_DISPLAY_HEIGHT,
	HUD_TOP_HEIGHT,
	HUD_BOTTOM_HEIGHT,
	playAreaViewport,
} from '../display';
import { stressTestLevel } from '@/data/levels/stress-test';

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

// The /stress-test page renders into the wide canvas instead, so its wide level fills the play area rather than
// being zoomed down to a thin strip in the middle of the portrait one.
describe('wide display', () => {
	it('is landscape, unlike the portrait game canvas', () => {
		expect(WIDE_DISPLAY_WIDTH).toBeGreaterThan(WIDE_DISPLAY_HEIGHT);
	});

	it('leaves a play area wider than it is tall', () => {
		const viewport = playAreaViewport(WIDE_DISPLAY_WIDTH, WIDE_DISPLAY_HEIGHT);
		expect(viewport.width).toBeGreaterThan(viewport.height);
	});

	it('fits the stress test level without zooming it down past half size', () => {
		const viewport = playAreaViewport(WIDE_DISPLAY_WIDTH, WIDE_DISPLAY_HEIGHT);
		const bounds = stressTestLevel.bounds;
		// The same zoom the GameScene's camera computes: fit the whole level into the play area.
		const zoom = Math.min(viewport.width / bounds.width, viewport.height / bounds.height);

		expect(zoom).toBeGreaterThan(0.5);
		// Both axes are close to filling the strip, so the level is not letterboxed with dead space either side.
		expect(bounds.width * zoom).toBeGreaterThan(viewport.width * 0.9);
		expect(bounds.height * zoom).toBeGreaterThan(viewport.height * 0.9);
	});
});
