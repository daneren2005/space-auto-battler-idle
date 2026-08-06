import Phaser from 'phaser';
import type { LevelConfig } from '@/data/levels';
import type { Carry } from '@/data/progress';
import GameWorld from './entities/game-world';
import GameScene from './game-scene';
import UIScene from './ui-scene';

// Expose the running Phaser.Game so end-to-end tests can read the live scene state (e.g. GameScene.stats) to
// prove the world is actually simulating - the debug stats now render into the canvas, which the DOM can't see.
declare global {
	interface Window {
		__game?: Phaser.Game
	}
}

export interface StartGameOptions {
	level: LevelConfig
	// Upgrades / money carried into this level from earlier ones.
	carry: Carry
	// The canvas resolution to render into: portrait for the campaign, landscape for the stress test.
	width: number
	height: number
	// Whether finishing the level writes the saved campaign progress.  Off for scratch levels (the stress test)
	// that are not part of the play order and must not disturb a run in progress.
	persistProgress?: boolean
}

// Boots a world + the game and HUD scenes into #phaser-container.  Every entry point (the campaign's index page,
// the stress-test page) goes through here so they can only differ in the level, the carry and the canvas size.
export default function startGame(options: StartGameOptions): Phaser.Game {
	const world = new GameWorld();

	const game = new Phaser.Game({
		type: Phaser.AUTO,
		// Fixed canvas resolution: the game camera zooms to fit the level's world into it, so the UI stays a
		// constant size no matter how big or small the level's bounds are.
		width: options.width,
		height: options.height,
		parent: 'phaser-container',
		backgroundColor: '#05070f',
		loader: {
			// Sprites / fonts live in public/, which is served from the deploy root - but a scene asks for them by
			// bare name ('boid.png'), which the loader would otherwise resolve against whatever page is open.  The
			// stress test and ship test sit a directory deeper (/stress-test/, /ship-test/), so without an explicit
			// base their assets 404.  When BASE_URL is an absolute path (the dev server's '/', or a configured
			// subpath) it already points at the deploy root.  The portable production build (base: '') makes it the
			// relative './' instead, which would resolve against this chunk's own assets/ directory - so in that case
			// walk one level up: bundled chunks always live in assets/, directly below the deploy root, wherever the
			// site is hosted.
			baseURL: new URL(
				import.meta.env.BASE_URL.startsWith('/') ? import.meta.env.BASE_URL : '../',
				import.meta.url,
			).href,
		},
		scale: {
			mode: Phaser.Scale.FIT,
			autoCenter: Phaser.Scale.CENTER_BOTH,
		},
		scene: [
			new GameScene({
				world,
				level: options.level,
				carry: options.carry,
				persistProgress: options.persistProgress,
			}),
			new UIScene(),
		],
	});

	window.__game = game;
	return game;
}
