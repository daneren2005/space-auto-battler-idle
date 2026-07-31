import Phaser from 'phaser';
import type GameScene from './game-scene';
import type { GameState } from './game-scene';
import formatStats from './format-stats';
import { HUD_TOP_HEIGHT, HUD_BOTTOM_HEIGHT } from './display';

// Key for the bitmap font (public/ui/orbitron.png + orbitron.fnt, exported from snowb.org).  All HUD / menu
// text is drawn with it so the UI has a consistent sci-fi typeface, coloured per-use with FILL-mode tint
// (setTintFill) so it works regardless of the atlas glyph colour.  NOTE: export it at a modest size (~100px)
// with a few px of glyph spacing - baking large (200px) + tight packing makes the small labels downscale into a
// grey haze between the letters.
const FONT = 'orbitron';

// The two upgrade buttons sit side by side, centred in the bottom HUD band.  BUTTON_OFFSET is how far each
// one's centre sits from the middle of the canvas, so the pair stays centred whatever the canvas width is.
const BUTTON_WIDTH = 280;
const BUTTON_HEIGHT = 64;
const BUTTON_GAP = 24;
const BUTTON_OFFSET = (BUTTON_WIDTH + BUTTON_GAP) / 2;

// The sci-fi HUD + menus, drawn as a second scene running on top of the game so it never gets cleared by the
// simulation.  It is purely presentational: every frame it reads the GameScene's public getters (player money,
// fleet size, upgrade cost, win/lose state) and reflects them, and its two interactive controls - the upgrade
// buttons - and the win/lose dialog call straight back into the GameScene.  Art is from the spacegameguiset kit
// under public/ui; text is the Orbitron bitmap font.
export default class UIScene extends Phaser.Scene {
	private gameScene!: GameScene;

	private levelText!: Phaser.GameObjects.BitmapText;
	private moneyText!: Phaser.GameObjects.BitmapText;
	private fleetText!: Phaser.GameObjects.BitmapText;

	private upgradeButton!: Phaser.GameObjects.Image;
	private upgradeLabel!: Phaser.GameObjects.BitmapText;

	private shieldButton!: Phaser.GameObjects.Image;
	private shieldLabel!: Phaser.GameObjects.BitmapText;

	private dialog!: Phaser.GameObjects.Container;
	private dialogTitle!: Phaser.GameObjects.BitmapText;
	private dialogMessage!: Phaser.GameObjects.BitmapText;
	private dialogButtonLabel!: Phaser.GameObjects.BitmapText;
	private dialogShownFor: GameState = 'playing';

	// Developer stats overlay, hidden until the player toggles it with the backtick (`) key.
	private statsPanel!: Phaser.GameObjects.Container;
	private statsText!: Phaser.GameObjects.BitmapText;
	private statsVisible = false;

	constructor() {
		super('ui');
	}

	preload() {
		this.load.image('ui-window', 'ui/window_whole.png');
		this.load.image('ui-button', 'ui/button_small_long_blue.png');
		this.load.image('ui-button-green', 'ui/button_small_long_green.png');
		// Phaser loads the .png atlas + its .fnt (BMFont XML) descriptor and renders any size from the baked glyphs.
		this.load.bitmapFont(FONT, 'ui/orbitron.png', 'ui/orbitron.fnt');
	}

	create() {
		this.gameScene = this.scene.get('game') as GameScene;
		const { width, height } = this.scale;

		// --- Top HUD band: level title, then player kill-reward money + fleet size on a second row ---
		// Bitmap glyphs are tinted with FILL mode: the tint colour replaces the glyph's RGB and only its alpha is
		// used for shape, so the text colours correctly no matter what colour the exported atlas glyphs are.
		// The canvas is narrow (portrait), so the rows stack rather than running along a single line: the level
		// title is centred on top, with money hugging the left edge and the fleet summary the right below it.
		this.levelText = this.add.bitmapText(width / 2, 30, FONT, '', 22)
			.setOrigin(0.5).setCenterAlign().setTintFill(0xcfe6ff);
		this.moneyText = this.add.bitmapText(24, 74, FONT, '', 28).setOrigin(0, 0.5).setTintFill(0xffd54a);
		this.fleetText = this.add.bitmapText(width - 24, 74, FONT, '', 18).setOrigin(1, 0.5).setTintFill(0x8fd6ff);

		// --- Bottom HUD band: the two upgrade buttons (ship rate + shields), centred side by side.  They are
		// sized for thumbs rather than a mouse pointer, since the portrait canvas is aimed at phones. ---
		const buttonY = height - HUD_BOTTOM_HEIGHT / 2;
		this.upgradeButton = this.add.image(width / 2 - BUTTON_OFFSET, buttonY, 'ui-button')
			.setDisplaySize(BUTTON_WIDTH, BUTTON_HEIGHT)
			.setInteractive({ useHandCursor: true });
		this.upgradeLabel = this.add.bitmapText(width / 2 - BUTTON_OFFSET, buttonY, FONT, '', 16)
			.setOrigin(0.5).setCenterAlign().setTintFill(0xffffff);
		this.upgradeButton.on('pointerdown', () => {
			this.gameScene.buyUpgrade();
		});

		this.shieldButton = this.add.image(width / 2 + BUTTON_OFFSET, buttonY, 'ui-button')
			.setDisplaySize(BUTTON_WIDTH, BUTTON_HEIGHT)
			.setInteractive({ useHandCursor: true });
		this.shieldLabel = this.add.bitmapText(width / 2 + BUTTON_OFFSET, buttonY, FONT, '', 16)
			.setOrigin(0.5).setCenterAlign().setTintFill(0xffffff);
		this.shieldButton.on('pointerdown', () => {
			this.gameScene.buyShieldUpgrade();
		});

		this.buildDialog(width, height);
		this.buildStatsPanel(width);
	}

	update() {
		this.levelText.setText(this.gameScene.levelLabel);
		this.moneyText.setText(`$${this.gameScene.playerMoney}`);
		this.fleetText.setText(`Fleet: +${this.gameScene.playerShipsPerSecond}/s   Shields: ${this.gameScene.playerShipShields}`);

		const shipCost = this.gameScene.upgradeCost;
		const shipAffordable = this.gameScene.canAffordUpgrade;
		this.upgradeLabel.setText(`+1 Ship/sec\n$${shipCost}`);
		this.upgradeButton.setAlpha(shipAffordable ? 1 : 0.45);
		this.upgradeButton.setTint(shipAffordable ? 0xffffff : 0x8899aa);

		const shieldCost = this.gameScene.shieldUpgradeCost;
		const shieldAffordable = this.gameScene.canAffordShieldUpgrade;
		this.shieldLabel.setText(`+1 Ship Shield\n$${shieldCost}`);
		this.shieldButton.setAlpha(shieldAffordable ? 1 : 0.45);
		this.shieldButton.setTint(shieldAffordable ? 0xffffff : 0x8899aa);

		const state = this.gameScene.gameState;
		if(state !== 'playing' && this.dialogShownFor !== state) {
			this.showDialog(state);
		}

		// Only spend the string-building work when the overlay is actually on screen.
		if(this.statsVisible) {
			this.statsText.setText(formatStats(this.gameScene.stats));
		}
	}

	// A developer stats overlay pinned to the right, just under the top HUD band so it never covers the level /
	// money text.  Hidden until toggled with the backtick key.  It mirrors the engine timing / memory / entity
	// snapshot the GameScene collects each second.
	private buildStatsPanel(width: number) {
		const margin = 12;
		const background = this.add.rectangle(0, 0, 400, 330, 0x03060f, 0.72)
			.setOrigin(1, 0)
			.setStrokeStyle(1, 0x1d3b5c);
		this.statsText = this.add.bitmapText(-16, 14, FONT, '', 15)
			.setOrigin(1, 0).setRightAlign().setTintFill(0x8fd6ff);

		this.statsPanel = this.add.container(width - margin, HUD_TOP_HEIGHT + margin, [background, this.statsText])
			.setDepth(200)
			.setVisible(false);

		this.input.keyboard?.on('keydown-BACKTICK', () => {
			this.statsVisible = !this.statsVisible;
			this.statsPanel.setVisible(this.statsVisible);
		});
	}

	private buildDialog(width: number, height: number) {
		const overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x03060f, 0.72);

		const panel = this.add.image(0, 0, 'ui-window').setDisplaySize(520, 380);

		this.dialogTitle = this.add.bitmapText(0, -134, FONT, '', 40).setOrigin(0.5).setCenterAlign();

		this.dialogMessage = this.add.bitmapText(0, -20, FONT, '', 18)
			.setOrigin(0.5).setCenterAlign().setMaxWidth(380).setTintFill(0xcfe6ff);

		const button = this.add.image(0, 96, 'ui-button-green')
			.setDisplaySize(240, 56)
			.setInteractive({ useHandCursor: true });
		this.dialogButtonLabel = this.add.bitmapText(0, 96, FONT, '', 20).setOrigin(0.5).setCenterAlign().setTintFill(0xffffff);
		button.on('pointerdown', () => {
			// The GameScene owns progression: advance + carry over on a win, retry on a loss (both via reload).
			this.gameScene.dialogAction();
		});

		this.dialog = this.add.container(width / 2, height / 2, [
			overlay, panel, this.dialogTitle, this.dialogMessage, button, this.dialogButtonLabel,
		]);
		// The overlay was built at absolute coords for full-screen sizing; re-home it to the container origin.
		overlay.setPosition(0, 0);
		this.dialog.setDepth(100).setVisible(false);
	}

	private showDialog(state: GameState) {
		this.dialogShownFor = state;
		if(state === 'won') {
			this.dialogTitle.setText('VICTORY').setTintFill(0x7cfc66);
			const next = this.gameScene.hasNextLevel
				? '\nYour upgrades carry into the next battle.'
				: '\nYou have cleared every level!';
			this.dialogMessage.setText(`You cleared "${this.gameScene.levelTitle}".${next}`);
		} else {
			this.dialogTitle.setText('DEFEAT').setTintFill(0xff5a5a);
			this.dialogMessage.setText('Your station was destroyed.\nRegroup and try again.');
		}
		this.dialogButtonLabel.setText(this.gameScene.dialogButtonLabel);
		this.dialog.setVisible(true);
	}
}
