import Phaser from 'phaser';
import type GameScene from './game-scene';
import type { GameState } from './game-scene';

// Key for the bitmap font (public/ui/orbitron.png + orbitron.fnt, exported from snowb.org).  All HUD / menu
// text is drawn with it so the UI has a consistent sci-fi typeface, coloured per-use with FILL-mode tint
// (setTintFill) so it works regardless of the atlas glyph colour.  NOTE: export it at a modest size (~100px)
// with a few px of glyph spacing - baking large (200px) + tight packing makes the small labels downscale into a
// grey haze between the letters.
const FONT = 'orbitron';

// The sci-fi HUD + menus, drawn as a second scene running on top of the game so it never gets cleared by the
// simulation.  It is purely presentational: every frame it reads the GameScene's public getters (player money,
// fleet size, upgrade cost, win/lose state) and reflects them, and its two interactive controls - the upgrade
// buttons - and the win/lose dialog call straight back into the GameScene.  Art is from the spacegameguiset kit
// under public/ui; text is the Orbitron bitmap font.
export default class UIScene extends Phaser.Scene {
	private gameScene!: GameScene;

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

		// --- Top-left HUD: player kill-reward money + fleet size ---
		// Bitmap glyphs are tinted with FILL mode: the tint colour replaces the glyph's RGB and only its alpha is
		// used for shape, so the text colours correctly no matter what colour the exported atlas glyphs are.
		this.moneyText = this.add.bitmapText(24, 20, FONT, '', 28).setTintFill(0xffd54a);
		this.fleetText = this.add.bitmapText(24, 58, FONT, '', 18).setTintFill(0x8fd6ff);

		// --- Bottom-left: the two upgrade buttons (ship slot + shields), laid out side by side ---
		this.upgradeButton = this.add.image(150, height - 46, 'ui-button')
			.setDisplaySize(240, 52)
			.setInteractive({ useHandCursor: true });
		this.upgradeLabel = this.add.bitmapText(150, height - 46, FONT, '', 16)
			.setOrigin(0.5).setCenterAlign().setTintFill(0xffffff);
		this.upgradeButton.on('pointerdown', () => {
			this.gameScene.buyUpgrade();
		});

		this.shieldButton = this.add.image(410, height - 46, 'ui-button')
			.setDisplaySize(240, 52)
			.setInteractive({ useHandCursor: true });
		this.shieldLabel = this.add.bitmapText(410, height - 46, FONT, '', 16)
			.setOrigin(0.5).setCenterAlign().setTintFill(0xffffff);
		this.shieldButton.on('pointerdown', () => {
			this.gameScene.buyShieldUpgrade();
		});

		this.buildDialog(width, height);
	}

	update() {
		this.moneyText.setText(`$${this.gameScene.playerMoney}`);
		this.fleetText.setText(`Fleet: ${this.gameScene.playerTotalFleet}   Shields: ${this.gameScene.playerShipShields}`);

		const shipCost = this.gameScene.upgradeCost;
		const shipAffordable = this.gameScene.canAffordUpgrade;
		this.upgradeLabel.setText(`+1 Ship Slot\n$${shipCost}`);
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
	}

	private buildDialog(width: number, height: number) {
		const overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x03060f, 0.72);

		const panel = this.add.image(0, 0, 'ui-window').setDisplaySize(520, 380);

		this.dialogTitle = this.add.bitmapText(0, -96, FONT, '', 40).setOrigin(0.5).setCenterAlign();

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
