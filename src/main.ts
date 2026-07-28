import Phaser from 'phaser';
import { levels, firstLevel } from '@/data/levels';
import { loadProgress } from '@/data/progress';
import { DISPLAY_WIDTH, DISPLAY_HEIGHT } from '@/game/display';
import GameWorld from '@/game/entities/game-world';
import GameScene from '@/game/game-scene';
import UIScene from '@/game/ui-scene';

// Expose the running Phaser.Game so end-to-end tests can read the live scene state (e.g. GameScene.stats) to
// prove the world is actually simulating - the debug stats now render into the canvas, which the DOM can't see.
declare global {
	interface Window {
		__game?: Phaser.Game
	}
}

const world = new GameWorld();

// Resume at the saved level with the upgrades / money carried over from earlier levels.
const progress = loadProgress();
const level = levels[progress.levelIndex] ?? firstLevel;

export const game = new Phaser.Game({
	type: Phaser.AUTO,
	// Fixed canvas resolution: the game camera zooms to fit the level's world into it, so the UI stays a
	// constant size no matter how big or small the level's bounds are.
	width: DISPLAY_WIDTH,
	height: DISPLAY_HEIGHT,
	parent: 'phaser-container',
	backgroundColor: '#05070f',
	scale: {
		mode: Phaser.Scale.FIT,
		autoCenter: Phaser.Scale.CENTER_BOTH,
	},
	scene: [
		new GameScene({
			world,
			level,
			carry: progress.carry,
		}),
		new UIScene(),
	],
});

window.__game = game;
