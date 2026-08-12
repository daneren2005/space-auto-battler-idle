import Phaser from 'phaser';
import type { LevelConfig } from '@/data/levels';
import type { Carry } from '@/data/progress';
import type { Meta } from '@/data/meta';
import GameWorld from './entities/game-world';
import GameScene from './game-scene';
import UIScene from './ui-scene';

// Expose the running Phaser.Game so e2e tests can read live scene state (the debug stats render into the canvas).
declare global {
	interface Window {
		__game?: Phaser.Game
	}
}

export interface StartGameOptions {
	level: LevelConfig
	carry: Carry
	// Highest level the run has reached so far (prestige banks Dark Matter off it).
	highestLevelIndex?: number
	// The prestige meta (Dark Matter + Ascendancy). Absent for scratch levels.
	meta?: Meta
	// Canvas resolution: portrait for the campaign, landscape for the stress test.
	width: number
	height: number
	// Off for scratch levels (the stress test) that must not disturb a run in progress.
	persistProgress?: boolean
}

// Boots a world + the game and HUD scenes into #phaser-container. Every entry point goes through here.
export default function startGame(options: StartGameOptions): Phaser.Game {
	const world = new GameWorld();

	const game = new Phaser.Game({
		type: Phaser.AUTO,
		// Fixed resolution: the camera zooms to fit the level, so the UI stays a constant size.
		width: options.width,
		height: options.height,
		parent: 'phaser-container',
		backgroundColor: '#05070f',
		loader: {
			// Assets are asked for by bare name and pages sit at varying depths (/stress-test/, ...), so resolve
			// them against the deploy root. An absolute BASE_URL already points there; the portable build's relative
			// './' resolves against this chunk's assets/ dir, so walk one level up to the root.
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
				highestLevelIndex: options.highestLevelIndex,
				meta: options.meta,
				persistProgress: options.persistProgress,
			}),
			new UIScene(),
		],
	});

	window.__game = game;
	return game;
}
