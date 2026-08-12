import Phaser from 'phaser';
import type GameScene from './game-scene';
import type { LevelNotice } from './game-scene';
import type ShipRoster from './ship-roster';
import formatStats from './format-stats';
import { HUD_TOP_HEIGHT, HUD_BOTTOM_HEIGHT } from './display';
import { SHIP_TYPES, SHIP_TYPE_DEFS, combatStat, nextLevelSummary, type ShipType } from '@/data/ship-types';
import { ASCENDANCY_NODES, ASCENDANCY_NODE_DEFS, nodeLevel, type AscendancyNodeId } from '@/data/ascendancy';
import { nodeCost, nodeAvailable, nodeMaxed } from '@/data/meta';

// snowb.org bitmap font; all HUD text is drawn with it, tinted per-use via setTintFill. Export at ~100px with
// a few px glyph spacing - large + tight packing makes small labels downscale into a grey haze.
const FONT = 'orbitron';

// Fleet bar: a row of tappable ship chips across the bottom band, dragged left/right when they overflow.
const CHIP_WIDTH = 132;
const CHIP_HEIGHT = 96;
const CHIP_GAP = 12;
const CHIP_ICON_BOX = 46;
// A pointer that moves more than this between press and release was a drag, not a tap.
const DRAG_THRESHOLD = 10;

const BUTTON_WIDTH = 200;
const BUTTON_HEIGHT = 56;

// Unlock drawer geometry; offsets measured from the panel's centre.
const DRAWER_PANEL_WIDTH = 680;
const DRAWER_PANEL_HEIGHT = 920;
const DRAWER_HEADING_Y = -324;
const DRAWER_ROWS_Y = -186;
const DRAWER_CLOSE_Y = 372;
const DRAWER_COLUMN_X = 150;
const DRAWER_ROW_HEIGHT = 108;
const DRAWER_UNLOCK_WIDTH = 244;
const DRAWER_UNLOCK_HEIGHT = 56;
const DRAWER_ICON_BOX = 34;
const DRAWER_ICON_X = -84;
const DRAWER_LABEL_X = 24;

interface Chip {
	container: Phaser.GameObjects.Container
	icon: Phaser.GameObjects.Image
	rateText: Phaser.GameObjects.BitmapText
}

const AFFORD_TINT = 0xffffff;
const DENY_TINT = 0x8899aa;

// Red used for destructive controls (the Reset Progress button + its confirm step).
const DANGER_TINT = 0xff8a8a;

// Pause menu geometry; the square pause button sits in the top-right of the top HUD band, its modal panel is centred.
const PAUSE_BUTTON_SIZE = 52;
const PAUSE_PANEL_WIDTH = 520;
const PAUSE_PANEL_HEIGHT = 620;
const PAUSE_MENU_BUTTON_WIDTH = 300;
const PAUSE_MENU_BUTTON_HEIGHT = 64;
// Vertical pitch when the pause menu stacks its (dynamically shown) buttons.
const PAUSE_MENU_BUTTON_PITCH = 84;

// Purple used for Dark Matter + the prestige controls.
const DARK_MATTER_TINT = 0xc39bff;

// The Ascendancy tree modal; offsets measured from the panel's centre. The window art has a nameplate oval up top
// and an inset frame border, so the heading sits in the oval and the rows/buttons stay pulled in from the edges.
const ASCENDANCY_PANEL_WIDTH = 680;
const ASCENDANCY_PANEL_HEIGHT = 900;
const ASCENDANCY_HEADING_Y = -318;
const ASCENDANCY_BALANCE_Y = -230;
const ASCENDANCY_ROWS_Y = -172;
const ASCENDANCY_ROW_HEIGHT = 92;
const ASCENDANCY_CLOSE_Y = 372;
const ASCENDANCY_BUY_WIDTH = 200;
const ASCENDANCY_BUY_HEIGHT = 56;
const ASCENDANCY_TEXT_X = -262;
const ASCENDANCY_BUY_X = 150;
// Widest a row's label/detail may run before it would reach the buy button.
const ASCENDANCY_TEXT_MAX_WIDTH = 300;

// Milliseconds before a level-change toast dismisses itself; a tap dismisses it sooner.
const TOAST_DURATION = 10000;

// The HUD + menus, a second scene on top of the game. Purely presentational: reads GameScene's public getters
// each frame and its controls call back into the GameScene / its roster.
export default class UIScene extends Phaser.Scene {
	private gameScene!: GameScene;

	private levelText!: Phaser.GameObjects.BitmapText;
	private moneyText!: Phaser.GameObjects.BitmapText;
	private fleetText!: Phaser.GameObjects.BitmapText;

	// One chip per ship type (locked types hidden) plus a trailing "＋" chip that opens the unlock drawer.
	private fleetBar!: Phaser.GameObjects.Container;
	private chips = new Map<ShipType, Chip>();
	private plusChip!: Phaser.GameObjects.Container;
	private fleetBarMinX = 0;
	private dragStartPointerX = 0;
	private dragStartBarX = 0;
	private dragging = false;

	// One reusable per-type card, retargeted to whichever type is open (null = closed).
	private card!: Phaser.GameObjects.Container;
	// Full-screen click-catcher behind the card so a tap off it closes the card.
	private cardBackdrop!: Phaser.GameObjects.Rectangle;
	private cardType: ShipType | null = null;
	private cardTitle!: Phaser.GameObjects.BitmapText;
	private cardStats!: Phaser.GameObjects.BitmapText;
	private cardUpgradeText!: Phaser.GameObjects.BitmapText;
	private cardRateButton!: Phaser.GameObjects.Image;
	private cardRateLabel!: Phaser.GameObjects.BitmapText;
	private cardLevelButton!: Phaser.GameObjects.Image;
	private cardLevelLabel!: Phaser.GameObjects.BitmapText;

	// Modal list of still-locked types + prices, rebuilt on open and after each unlock.
	private drawer!: Phaser.GameObjects.Container;
	private drawerRows!: Phaser.GameObjects.Container;
	private drawerEmpty!: Phaser.GameObjects.BitmapText;
	private drawerCells: Array<{ type: ShipType, button: Phaser.GameObjects.Image, icon: Phaser.GameObjects.Image }> = [];

	// Banner announcing an automatic level jump (see GameScene). Auto-dismisses after TOAST_DURATION, or on a tap.
	private toast!: Phaser.GameObjects.Container;
	private toastText!: Phaser.GameObjects.BitmapText;
	private toastTimer?: Phaser.Time.TimerEvent;

	// Developer stats overlay, toggled with the backtick (`) key.
	private statsPanel!: Phaser.GameObjects.Container;
	private statsText!: Phaser.GameObjects.BitmapText;
	private statsVisible = false;

	// Pause menu: the top-right button opens a modal with Resume + Reset Progress. Reset swaps the menu into a
	// two-step confirm before it wipes the run. The GameScene owns the actual paused flag; this only drives it.
	private pauseButton!: Phaser.GameObjects.Container;
	private pauseMenu!: Phaser.GameObjects.Container;
	private pauseMainButtons!: Phaser.GameObjects.Container;
	private pauseConfirmButtons!: Phaser.GameObjects.Container;
	private ascendancyButton!: Phaser.GameObjects.Container;
	private singularityButton!: Phaser.GameObjects.Container;
	private resetButton!: Phaser.GameObjects.Container;
	private resumeButton!: Phaser.GameObjects.Container;
	// The confirm step is generic: whatever staged it sets the warning line + this handler.
	private confirmWarning!: Phaser.GameObjects.BitmapText;
	private pendingConfirm: (() => void) | null = null;

	// The Ascendancy modal: Dark Matter balance + one row per node, opened from the pause menu.
	private ascendancyMenu!: Phaser.GameObjects.Container;
	private ascendancyBalance!: Phaser.GameObjects.BitmapText;
	private ascendancyRows = new Map<AscendancyNodeId, {
		title: Phaser.GameObjects.BitmapText
		detail: Phaser.GameObjects.BitmapText
		button: Phaser.GameObjects.Image
		buttonLabel: Phaser.GameObjects.BitmapText
	}>();

	constructor() {
		super('ui');
	}

	preload() {
		this.load.image('ui-window', 'ui/window_whole.png');
		this.load.image('ui-button', 'ui/button_small_long_blue.png');
		this.load.image('ui-button-green', 'ui/button_small_long_green.png');
		// Chips reuse the game's ship silhouettes; load them here too (Phaser skips already-loaded keys).
		this.load.image('boid', 'boid.png');
		for(const type of SHIP_TYPES) {
			this.load.image(type, SHIP_TYPE_DEFS[type].sprite);
		}
		this.load.bitmapFont(FONT, 'ui/orbitron.png', 'ui/orbitron.fnt');
	}

	create() {
		this.gameScene = this.scene.get('game') as GameScene;
		const { width, height } = this.scale;

		// Top HUD band: level title, then money + fleet size on a second row.
		this.levelText = this.add.bitmapText(width / 2, 30, FONT, '', 22)
			.setOrigin(0.5).setCenterAlign().setTintFill(0xcfe6ff);
		this.moneyText = this.add.bitmapText(24, 74, FONT, '', 28).setOrigin(0, 0.5).setTintFill(0xffd54a);
		this.fleetText = this.add.bitmapText(width - 24, 74, FONT, '', 18).setOrigin(1, 0.5).setTintFill(0x8fd6ff);

		this.buildFleetBar(height);
		this.buildCard(width, height);
		this.buildDrawer(width, height);
		this.buildToast(width);
		this.buildStatsPanel(width);
		this.buildPauseMenu(width, height);
		this.buildAscendancyMenu(width, height);
	}

	update() {
		this.levelText.setText(this.gameScene.levelLabel);
		this.moneyText.setText(`$${this.gameScene.playerMoney}`);
		this.fleetText.setText(`Fleet: ${this.gameScene.playerShips}  (+${this.gameScene.playerShipsPerSecond}/s)`);

		const roster = this.gameScene.shipRoster;
		if(roster) {
			this.refreshFleetBar(roster);
			if(this.cardType) {
				this.refreshCard(roster, this.cardType);
			}
			if(this.drawer.visible) {
				this.refreshDrawer(roster);
			}
		}

		if(this.ascendancyMenu.visible) {
			this.refreshAscendancyMenu();
		}

		// Once the match is decided, close the overlays so a stray tap can't buy against a gone station.
		if(this.gameScene.gameState !== 'playing') {
			this.closeCard();
			this.closeDrawer();
			this.closeAscendancyMenu();
			this.closePauseMenu();
		}

		const notice = this.gameScene.takeNotice();
		if(notice) {
			this.showToast(notice);
		}

		// Only build the string when the overlay is on screen.
		if(this.statsVisible) {
			this.statsText.setText(formatStats(this.gameScene.stats));
		}
	}

	// --- Fleet bar -------------------------------------------------------------------------------------------

	private buildFleetBar(height: number) {
		const barY = height - HUD_BOTTOM_HEIGHT / 2;
		this.fleetBar = this.add.container(0, barY);

		// One chip per type, built up front; refreshFleetBar shows/hides and lays them out each frame.
		for(const type of SHIP_TYPES) {
			const background = this.add.image(0, 0, 'ui-button')
				.setDisplaySize(CHIP_WIDTH, CHIP_HEIGHT)
				.setInteractive({ useHandCursor: true });
			const icon = this.add.image(0, -14, this.textures.exists(type) ? type : 'boid');
			this.fitIcon(icon, CHIP_ICON_BOX);
			icon.setTint(this.gameScene.playerColor);
			const rateText = this.add.bitmapText(0, 30, FONT, '', 18).setOrigin(0.5).setCenterAlign().setTintFill(0xffffff);

			const container = this.add.container(0, 0, [background, icon, rateText]);
			this.fleetBar.add(container);

			// A press that didn't turn into a drag opens this type's card.
			background.on('pointerup', () => {
				if(!this.dragging) {
					this.openCard(type);
				}
			});

			this.chips.set(type, { container, icon, rateText });
		}

		// The trailing "＋" chip, shown only while something is still locked.
		const plusBackground = this.add.image(0, 0, 'ui-button-green')
			.setDisplaySize(CHIP_WIDTH, CHIP_HEIGHT)
			.setInteractive({ useHandCursor: true });
		const plusLabel = this.add.bitmapText(0, 0, FONT, '+', 44).setOrigin(0.5).setCenterAlign().setTintFill(0xffffff);
		this.plusChip = this.add.container(0, 0, [plusBackground, plusLabel]);
		this.fleetBar.add(this.plusChip);
		plusBackground.on('pointerup', () => {
			if(!this.dragging) {
				this.openDrawer();
			}
		});

		// Scene-level pointer events drive the horizontal drag; a gesture past DRAG_THRESHOLD sets `dragging`,
		// which the chip handlers check to tell a scroll from a tap.
		this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
			if(!this.canDragFleetBar(pointer, height)) {
				return;
			}
			this.dragging = false;
			this.dragStartPointerX = pointer.x;
			this.dragStartBarX = this.fleetBar.x;
		});
		this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
			if(!pointer.isDown || !this.canDragFleetBar(pointer, height)) {
				return;
			}
			const dx = pointer.x - this.dragStartPointerX;
			if(Math.abs(dx) > DRAG_THRESHOLD) {
				this.dragging = true;
			}
			this.fleetBar.x = Phaser.Math.Clamp(this.dragStartBarX + dx, this.fleetBarMinX, 0);
		});
	}

	// Draggable only while no overlay is up and the gesture is in the bottom band.
	private canDragFleetBar(pointer: Phaser.Input.Pointer, height: number): boolean {
		return !this.card.visible && !this.drawer.visible && !this.pauseMenu.visible && !this.ascendancyMenu.visible
			&& pointer.y >= height - HUD_BOTTOM_HEIGHT;
	}

	// Scales an icon to fit a square box without stretching.
	private fitIcon(icon: Phaser.GameObjects.Image, box: number) {
		const scale = Math.min(box / icon.width, box / icon.height);
		icon.setScale(scale);
	}

	private refreshFleetBar(roster: ShipRoster) {
		const { width } = this.scale;
		// Gather the chips shown this frame, hiding locked ones; the "＋" chip trails whenever anything is locked.
		const visible: Array<Phaser.GameObjects.Container> = [];
		let anyLocked = false;
		for(const type of SHIP_TYPES) {
			const chip = this.chips.get(type)!;
			if(roster.isLocked(type)) {
				chip.container.setVisible(false);
				anyLocked = true;
				continue;
			}
			chip.container.setVisible(true);
			chip.rateText.setText(`+${roster.rate(type)}/s`);
			// Brighter when either upgrade is affordable.
			const canBuy = roster.canBuyRate(type) || roster.canBuyLevel(type);
			chip.container.setAlpha(canBuy ? 1 : 0.4);
			visible.push(chip.container);
		}

		this.plusChip.setVisible(anyLocked);
		if(anyLocked) {
			this.plusChip.setAlpha(roster.money >= this.cheapestUnlockCost(roster) ? 1 : 0.4);
			visible.push(this.plusChip);
		}

		if(visible.length === 0) {
			return;
		}

		// Chips keep natural size while the row fits, then shrink uniformly on overflow; centred.
		const count = visible.length;
		const naturalWidth = count * CHIP_WIDTH + (count - 1) * CHIP_GAP;
		const availableWidth = width - 2 * CHIP_GAP;
		const scale = Math.min(1, availableWidth / naturalWidth);
		const pitch = (CHIP_WIDTH + CHIP_GAP) * scale;
		const totalWidth = naturalWidth * scale;
		let x = (width - totalWidth) / 2 + (CHIP_WIDTH * scale) / 2;
		for(const container of visible) {
			container.setScale(scale).setPosition(x, 0);
			x += pitch;
		}

		// The row always fits now, so the bar never needs scrolling.
		this.fleetBarMinX = 0;
		this.fleetBar.x = 0;
	}

	private cheapestUnlockCost(roster: ShipRoster): number {
		let cheapest = Infinity;
		for(const type of SHIP_TYPES) {
			if(roster.isLocked(type)) {
				cheapest = Math.min(cheapest, roster.unlockCost(type));
			}
		}
		return cheapest;
	}

	// --- Type card -------------------------------------------------------------------------------------------

	private buildCard(width: number, height: number) {
		const cardY = height - HUD_BOTTOM_HEIGHT - 200;

		// Full-screen click-catcher; a tap off the card closes it. The panel is interactive too so taps on its
		// own blank areas are swallowed rather than falling through to this backdrop.
		this.cardBackdrop = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0)
			.setInteractive()
			.setDepth(49)
			.setVisible(false);
		this.cardBackdrop.on('pointerup', () => this.closeCard());

		const panel = this.add.image(0, 0, 'ui-window').setDisplaySize(460, 360).setInteractive();

		this.cardTitle = this.add.bitmapText(0, -132, FONT, '', 26).setOrigin(0.5).setCenterAlign().setTintFill(0xcfe6ff);
		this.cardStats = this.add.bitmapText(0, -58, FONT, '', 18).setOrigin(0.5).setCenterAlign().setTintFill(0x8fd6ff);
		this.cardUpgradeText = this.add.bitmapText(0, 24, FONT, '', 16).setOrigin(0.5).setCenterAlign().setTintFill(0xffd54a);

		this.cardRateButton = this.add.image(-114, 96, 'ui-button')
			.setDisplaySize(BUTTON_WIDTH, BUTTON_HEIGHT)
			.setInteractive({ useHandCursor: true });
		this.cardRateLabel = this.add.bitmapText(-114, 96, FONT, '', 15).setOrigin(0.5).setCenterAlign().setTintFill(0xffffff);
		this.cardRateButton.on('pointerup', () => {
			const roster = this.gameScene.shipRoster;
			if(roster && this.cardType) {
				roster.buyRate(this.cardType);
			}
		});

		this.cardLevelButton = this.add.image(114, 96, 'ui-button')
			.setDisplaySize(BUTTON_WIDTH, BUTTON_HEIGHT)
			.setInteractive({ useHandCursor: true });
		this.cardLevelLabel = this.add.bitmapText(114, 96, FONT, '', 15).setOrigin(0.5).setCenterAlign().setTintFill(0xffffff);
		this.cardLevelButton.on('pointerup', () => {
			const roster = this.gameScene.shipRoster;
			if(roster && this.cardType) {
				roster.buyLevel(this.cardType);
			}
		});

		const closeButton = this.add.image(206, -150, 'ui-button')
			.setDisplaySize(48, 48)
			.setInteractive({ useHandCursor: true })
			.setTint(0xff8a8a);
		const closeLabel = this.add.bitmapText(206, -150, FONT, 'x', 22).setOrigin(0.5).setCenterAlign().setTintFill(0xffffff);
		closeButton.on('pointerup', () => this.closeCard());

		this.card = this.add.container(width / 2, cardY, [
			panel, this.cardTitle, this.cardStats, this.cardUpgradeText,
			this.cardRateButton, this.cardRateLabel,
			this.cardLevelButton, this.cardLevelLabel,
			closeButton, closeLabel,
		]).setDepth(50).setVisible(false);
	}

	private openCard(type: ShipType) {
		this.closeDrawer();
		this.cardType = type;
		this.cardBackdrop.setVisible(true);
		this.card.setVisible(true);
	}
	private closeCard() {
		this.cardType = null;
		this.cardBackdrop.setVisible(false);
		this.card.setVisible(false);
	}

	private refreshCard(roster: ShipRoster, type: ShipType) {
		const def = SHIP_TYPE_DEFS[type];
		const level = roster.level(type);
		this.cardTitle.setText(def.name);

		// The last stat line names the type's own offence (bullet/missile/blast damage, or a Carrier's drones).
		const stat = combatStat(def, level);
		this.cardStats.setText(
			`Rate  +${roster.rate(type)}/s\n`
			+ `Level  ${level}\n`
			+ `Shields  ${roster.shields(type)}\n`
			+ `${stat.label}  ${stat.value}`,
		);
		this.cardUpgradeText.setText(`Next level: ${nextLevelSummary(def, level)}`);

		this.cardRateLabel.setText(`+1 Ship/sec\n$${roster.rateCost(type)}`);
		this.styleBuyButton(this.cardRateButton, roster.canBuyRate(type));

		this.cardLevelLabel.setText(`+1 Level\n$${roster.levelCost(type)}`);
		this.styleBuyButton(this.cardLevelButton, roster.canBuyLevel(type));
	}

	private styleBuyButton(button: Phaser.GameObjects.Image, affordable: boolean) {
		button.setAlpha(affordable ? 1 : 0.45);
		button.setTint(affordable ? AFFORD_TINT : DENY_TINT);
	}

	// --- Unlock drawer ---------------------------------------------------------------------------------------

	private buildDrawer(width: number, height: number) {
		const overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x03060f, 0.72)
			.setInteractive();
		overlay.on('pointerup', () => this.closeDrawer());

		// Interactive so a tap on its blank frame is swallowed rather than falling through to the backdrop.
		const panel = this.add.image(width / 2, height / 2, 'ui-window').setDisplaySize(DRAWER_PANEL_WIDTH, DRAWER_PANEL_HEIGHT)
			.setInteractive();
		const heading = this.add.bitmapText(width / 2, height / 2 + DRAWER_HEADING_Y, FONT, 'UNLOCK SHIPS', 30)
			.setOrigin(0.5).setCenterAlign().setTintFill(0xcfe6ff);
		this.drawerEmpty = this.add.bitmapText(width / 2, height / 2, FONT, 'Every ship is unlocked.', 20)
			.setOrigin(0.5).setCenterAlign().setTintFill(0x8fd6ff).setVisible(false);

		// Rows in their own container so a rebuild only touches this, not the panel + heading.
		this.drawerRows = this.add.container(width / 2, height / 2 + DRAWER_ROWS_Y);

		const closeButton = this.add.image(width / 2, height / 2 + DRAWER_CLOSE_Y, 'ui-button-green')
			.setDisplaySize(240, 60)
			.setInteractive({ useHandCursor: true });
		const closeLabel = this.add.bitmapText(width / 2, height / 2 + DRAWER_CLOSE_Y, FONT, 'Close', 20)
			.setOrigin(0.5).setCenterAlign().setTintFill(0xffffff);
		closeButton.on('pointerup', () => this.closeDrawer());

		this.drawer = this.add.container(0, 0, [overlay, panel, heading, this.drawerEmpty, this.drawerRows, closeButton, closeLabel])
			.setDepth(80).setVisible(false);
	}

	private openDrawer() {
		this.closeCard();
		this.drawer.setVisible(true);
		const roster = this.gameScene.shipRoster;
		if(roster) {
			this.rebuildDrawerRows(roster);
		}
	}
	private closeDrawer() {
		this.drawer.setVisible(false);
	}

	// Two columns so the whole roster (~10 types) fits without scrolling; each cell stacks name over unlock button.
	private rebuildDrawerRows(roster: ShipRoster) {
		this.drawerRows.removeAll(true);
		this.drawerCells = [];

		const locked = SHIP_TYPES.filter(type => roster.isLocked(type));
		this.drawerEmpty.setVisible(locked.length === 0);

		locked.forEach((type, i) => {
			const x = i % 2 === 0 ? -DRAWER_COLUMN_X : DRAWER_COLUMN_X;
			const y = Math.floor(i / 2) * DRAWER_ROW_HEIGHT;
			const name = this.add.bitmapText(x, y - 26, FONT, SHIP_TYPE_DEFS[type].name, 18)
				.setOrigin(0.5).setCenterAlign().setTintFill(0xcfe6ff);

			const button = this.add.image(x, y + 18, 'ui-button')
				.setDisplaySize(DRAWER_UNLOCK_WIDTH, DRAWER_UNLOCK_HEIGHT)
				.setInteractive({ useHandCursor: true });
			const icon = this.add.image(x + DRAWER_ICON_X, y + 18, this.textures.exists(type) ? type : 'boid')
				.setTint(this.gameScene.playerColor);
			this.fitIcon(icon, DRAWER_ICON_BOX);
			const label = this.add.bitmapText(x + DRAWER_LABEL_X, y + 18, FONT, `Unlock  $${roster.unlockCost(type)}`, 15)
				.setOrigin(0.5).setCenterAlign().setTintFill(0xffffff);
			button.on('pointerup', () => {
				if(roster.unlock(type)) {
					this.rebuildDrawerRows(roster);
				}
			});

			this.drawerRows.add([name, button, icon, label]);
			this.drawerCells.push({ type, button, icon });
		});
	}

	// Each frame the drawer is open: dim the button and icon of any type out of reach.
	private refreshDrawer(roster: ShipRoster) {
		for(const cell of this.drawerCells) {
			const affordable = roster.canUnlock(cell.type);
			this.styleBuyButton(cell.button, affordable);
			cell.icon.setAlpha(affordable ? 1 : 0.45);
		}
	}

	// --- Developer stats overlay -----------------------------------------------------------------------------

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

	// --- Pause menu ------------------------------------------------------------------------------------------

	private buildPauseMenu(width: number, height: number) {
		// Square button in the top-right of the top HUD band. "II" is the pause glyph (the font is ASCII-only).
		const buttonBackground = this.add.image(0, 0, 'ui-button')
			.setDisplaySize(PAUSE_BUTTON_SIZE, PAUSE_BUTTON_SIZE)
			.setInteractive({ useHandCursor: true });
		const buttonLabel = this.add.bitmapText(0, 0, FONT, 'II', 22).setOrigin(0.5).setCenterAlign().setTintFill(0xffffff);
		this.pauseButton = this.add.container(width - 24 - PAUSE_BUTTON_SIZE / 2, 34, [buttonBackground, buttonLabel]);
		buttonBackground.on('pointerup', () => this.openPauseMenu());

		const cx = width / 2;
		const cy = height / 2;

		// Modal dim; interactive so a tap outside the panel is swallowed rather than resuming by accident.
		const overlay = this.add.rectangle(cx, cy, width, height, 0x03060f, 0.72).setInteractive();
		const panel = this.add.image(cx, cy, 'ui-window').setDisplaySize(PAUSE_PANEL_WIDTH, PAUSE_PANEL_HEIGHT).setInteractive();
		const heading = this.add.bitmapText(cx, cy - 220, FONT, 'PAUSED', 34).setOrigin(0.5).setCenterAlign().setTintFill(0xcfe6ff);

		// Main state: prestige controls (shown once unlocked) above the destructive reset, with Resume last. The set on
		// screen varies, so showPauseMain stacks whichever are visible - positions here are placeholders.
		this.ascendancyButton = this.makeMenuButton(cx, 0, 'The Ascendancy', 'ui-button', () => this.openAscendancyMenu(), DARK_MATTER_TINT);
		this.singularityButton = this.makeMenuButton(cx, 0, 'Enter the Singularity', 'ui-button', () => this.stageSingularityConfirm(), DARK_MATTER_TINT);
		this.resetButton = this.makeMenuButton(cx, 0, 'Reset Progress', 'ui-button', () => this.stageResetConfirm(), DANGER_TINT);
		this.resumeButton = this.makeMenuButton(cx, 0, 'Resume', 'ui-button-green', () => this.closePauseMenu());
		this.pauseMainButtons = this.add.container(0, 0, [this.ascendancyButton, this.singularityButton, this.resetButton, this.resumeButton]);

		// Confirm state: a settable warning + the two-step commit (routed to pendingConfirm) or back out (Cancel).
		this.confirmWarning = this.add.bitmapText(cx, cy - 96, FONT, '', 20)
			// Kept well inside the inset window frame so long confirm copy doesn't run into the panel edges.
			.setOrigin(0.5).setCenterAlign().setMaxWidth(PAUSE_PANEL_WIDTH - 160).setTintFill(0xff8a8a);
		const confirm = this.makeMenuButton(cx, cy + 40, 'Confirm', 'ui-button', () => this.runConfirm(), DANGER_TINT);
		const cancel = this.makeMenuButton(cx, cy + 140, 'Cancel', 'ui-button-green', () => this.showPauseMain());
		this.pauseConfirmButtons = this.add.container(0, 0, [this.confirmWarning, confirm, cancel]).setVisible(false);

		this.pauseMenu = this.add.container(0, 0, [overlay, panel, heading, this.pauseMainButtons, this.pauseConfirmButtons])
			.setDepth(90).setVisible(false);

		// SPACE mirrors the button: toggles the menu (and so the pause) while a match is live. From the Ascendancy it
		// steps back to the pause menu first.
		this.input.keyboard?.on('keydown-SPACE', () => {
			if(this.ascendancyMenu.visible) {
				this.closeAscendancyToPause();
			} else if(this.pauseMenu.visible) {
				this.closePauseMenu();
			} else {
				this.openPauseMenu();
			}
		});
	}

	private makeMenuButton(x: number, y: number, text: string, texture: string, onClick: () => void, tint?: number): Phaser.GameObjects.Container {
		const background = this.add.image(0, 0, texture)
			.setDisplaySize(PAUSE_MENU_BUTTON_WIDTH, PAUSE_MENU_BUTTON_HEIGHT)
			.setInteractive({ useHandCursor: true });
		if(tint !== undefined) {
			background.setTint(tint);
		}
		const label = this.add.bitmapText(0, 0, FONT, text, 20).setOrigin(0.5).setCenterAlign().setTintFill(0xffffff);
		background.on('pointerup', onClick);
		return this.add.container(x, y, [background, label]);
	}

	private openPauseMenu() {
		if(this.gameScene.gameState !== 'playing') {
			return;
		}
		this.closeCard();
		this.closeDrawer();
		this.showPauseMain();
		this.pauseMenu.setVisible(true);
		this.gameScene.setPaused(true);
	}

	private closePauseMenu() {
		if(!this.pauseMenu.visible && !this.ascendancyMenu.visible) {
			return;
		}
		this.closeAscendancyMenu();
		this.pauseMenu.setVisible(false);
		this.gameScene.setPaused(false);
	}

	// The set of main-menu buttons varies (prestige controls only once unlocked), so pick the visible ones and stack
	// them, bottom-anchored on Resume, each frame the main state is shown.
	private showPauseMain() {
		const prestige = this.gameScene.prestigeUnlocked;
		this.ascendancyButton.setVisible(prestige);
		this.singularityButton.setVisible(prestige);
		this.resetButton.setVisible(this.gameScene.canResetProgress);
		this.resumeButton.setVisible(true);

		const stack = [this.ascendancyButton, this.singularityButton, this.resetButton, this.resumeButton]
			.filter(button => button.visible);
		const cy = this.scale.height / 2;
		// Resume sits near the panel bottom; the rest stack up from it.
		const bottomY = cy + 210;
		stack.forEach((button, i) => button.setY(bottomY - (stack.length - 1 - i) * PAUSE_MENU_BUTTON_PITCH));

		this.pauseMainButtons.setVisible(true);
		this.pauseConfirmButtons.setVisible(false);
	}

	private stageResetConfirm() {
		this.stagePauseConfirm('Wipe your entire run and restart from level 1?\nThe Ascendancy is kept.', () => {
			this.pauseMenu.setVisible(false);
			this.gameScene.resetProgressToStart();
		});
	}

	private stageSingularityConfirm() {
		const earned = this.gameScene.projectedDarkMatter;
		this.stagePauseConfirm(`Collapse this run into a Singularity and bank ${earned} Dark Matter?`, () => {
			this.pauseMenu.setVisible(false);
			this.gameScene.enterSingularity();
		});
	}

	private stagePauseConfirm(message: string, action: () => void) {
		this.confirmWarning.setText(message);
		this.pendingConfirm = action;
		this.pauseMainButtons.setVisible(false);
		this.pauseConfirmButtons.setVisible(true);
	}

	private runConfirm() {
		const action = this.pendingConfirm;
		this.pendingConfirm = null;
		action?.();
	}

	// --- The Ascendancy (prestige tree) ----------------------------------------------------------------------

	private buildAscendancyMenu(width: number, height: number) {
		const cx = width / 2;
		const cy = height / 2;

		// Tap-outside returns to the pause menu rather than resuming, so a stray tap can't unpause mid-spend.
		const overlay = this.add.rectangle(cx, cy, width, height, 0x03060f, 0.82).setInteractive();
		overlay.on('pointerup', () => this.closeAscendancyToPause());
		const panel = this.add.image(cx, cy, 'ui-window').setDisplaySize(ASCENDANCY_PANEL_WIDTH, ASCENDANCY_PANEL_HEIGHT).setInteractive();
		const heading = this.add.bitmapText(cx, cy + ASCENDANCY_HEADING_Y, FONT, 'THE ASCENDANCY', 30)
			.setOrigin(0.5).setCenterAlign().setTintFill(0xcfe6ff);
		this.ascendancyBalance = this.add.bitmapText(cx, cy + ASCENDANCY_BALANCE_Y, FONT, '', 22)
			.setOrigin(0.5).setCenterAlign().setTintFill(DARK_MATTER_TINT);

		const children: Array<Phaser.GameObjects.GameObject> = [overlay, panel, heading, this.ascendancyBalance];

		ASCENDANCY_NODES.forEach((id, i) => {
			const rowY = cy + ASCENDANCY_ROWS_Y + i * ASCENDANCY_ROW_HEIGHT;
			const title = this.add.bitmapText(cx + ASCENDANCY_TEXT_X, rowY - 24, FONT, '', 20)
				.setOrigin(0, 0.5).setTintFill(0xcfe6ff);
			const detail = this.add.bitmapText(cx + ASCENDANCY_TEXT_X, rowY + 16, FONT, ASCENDANCY_NODE_DEFS[id].perLevel, 15)
				.setOrigin(0, 0.5).setMaxWidth(ASCENDANCY_TEXT_MAX_WIDTH).setTintFill(0x8fd6ff);
			const button = this.add.image(cx + ASCENDANCY_BUY_X, rowY, 'ui-button')
				.setDisplaySize(ASCENDANCY_BUY_WIDTH, ASCENDANCY_BUY_HEIGHT)
				.setInteractive({ useHandCursor: true });
			const buttonLabel = this.add.bitmapText(cx + ASCENDANCY_BUY_X, rowY, FONT, '', 15)
				.setOrigin(0.5).setCenterAlign().setTintFill(0xffffff);
			button.on('pointerup', () => this.gameScene.buyAscendancyNode(id));

			this.ascendancyRows.set(id, { title, detail, button, buttonLabel });
			children.push(title, detail, button, buttonLabel);
		});

		const closeButton = this.add.image(cx, cy + ASCENDANCY_CLOSE_Y, 'ui-button-green')
			.setDisplaySize(240, 60)
			.setInteractive({ useHandCursor: true });
		const closeLabel = this.add.bitmapText(cx, cy + ASCENDANCY_CLOSE_Y, FONT, 'Back', 20)
			.setOrigin(0.5).setCenterAlign().setTintFill(0xffffff);
		closeButton.on('pointerup', () => this.closeAscendancyToPause());
		children.push(closeButton, closeLabel);

		this.ascendancyMenu = this.add.container(0, 0, children).setDepth(95).setVisible(false);
	}

	private openAscendancyMenu() {
		this.pauseMenu.setVisible(false);
		this.ascendancyMenu.setVisible(true);
		this.refreshAscendancyMenu();
	}

	private closeAscendancyMenu() {
		this.ascendancyMenu.setVisible(false);
	}

	// The tree hangs off the pause menu, so backing out returns there (still paused) rather than resuming.
	private closeAscendancyToPause() {
		if(!this.ascendancyMenu.visible) {
			return;
		}
		this.closeAscendancyMenu();
		if(this.gameScene.gameState === 'playing') {
			this.showPauseMain();
			this.pauseMenu.setVisible(true);
		}
	}

	private refreshAscendancyMenu() {
		const meta = this.gameScene.prestigeMeta;
		this.ascendancyBalance.setText(`Dark Matter: ${meta.darkMatter}`);

		for(const id of ASCENDANCY_NODES) {
			const row = this.ascendancyRows.get(id)!;
			const def = ASCENDANCY_NODE_DEFS[id];
			const level = nodeLevel(meta.nodes, id);
			row.title.setText(`${def.name}   ${level}/${def.maxLevel}`);

			if(nodeMaxed(meta, id)) {
				row.buttonLabel.setText('MAX');
				this.styleBuyButton(row.button, false);
			} else if(!nodeAvailable(meta, id)) {
				const req = def.requires!;
				row.buttonLabel.setText(`Needs ${ASCENDANCY_NODE_DEFS[req.node].name} ${req.level}`);
				this.styleBuyButton(row.button, false);
			} else {
				const cost = nodeCost(meta, id);
				row.buttonLabel.setText(`Buy  ${cost} DM`);
				this.styleBuyButton(row.button, meta.darkMatter >= cost);
			}
		}
	}

	// --- Level-change toast ----------------------------------------------------------------------------------

	// Built hidden; showToast fills and reveals it. Background interactive so a tap anywhere dismisses it early.
	private buildToast(width: number) {
		const y = HUD_TOP_HEIGHT + 34;
		const background = this.add.rectangle(0, 0, width - 48, 56, 0x0a1c33, 0.94)
			.setStrokeStyle(2, 0x2f6ea5)
			.setInteractive({ useHandCursor: true });
		this.toastText = this.add.bitmapText(0, 0, FONT, '', 18)
			.setOrigin(0.5).setCenterAlign().setMaxWidth(width - 96).setTintFill(0xcfe6ff);

		this.toast = this.add.container(width / 2, y, [background, this.toastText]).setDepth(300).setVisible(false);
		background.on('pointerup', () => this.hideToast());
	}

	private showToast(notice: LevelNotice) {
		this.toastText.setText(notice.message).setTintFill(notice.tone === 'good' ? 0x7cfc66 : 0xff8a8a);
		this.toast.setVisible(true);
		// Restart the countdown so the newest message gets its full dwell.
		this.toastTimer?.remove();
		this.toastTimer = this.time.delayedCall(TOAST_DURATION, () => this.hideToast());
	}

	private hideToast() {
		this.toastTimer?.remove();
		this.toastTimer = undefined;
		this.toast.setVisible(false);
	}
}
