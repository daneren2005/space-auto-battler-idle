import Phaser from 'phaser';
import type GameScene from './game-scene';
import type { GameState } from './game-scene';
import type ShipRoster from './ship-roster';
import formatStats from './format-stats';
import { HUD_TOP_HEIGHT, HUD_BOTTOM_HEIGHT } from './display';
import { SHIP_TYPES, SHIP_TYPE_DEFS, combatStat, nextLevelSummary, type ShipType } from '@/data/ship-types';

// Key for the bitmap font (public/ui/orbitron.png + orbitron.fnt, exported from snowb.org).  All HUD / menu
// text is drawn with it so the UI has a consistent sci-fi typeface, coloured per-use with FILL-mode tint
// (setTintFill) so it works regardless of the atlas glyph colour.  NOTE: export it at a modest size (~100px)
// with a few px of glyph spacing - baking large (200px) + tight packing makes the small labels downscale into a
// grey haze between the letters.
const FONT = 'orbitron';

// --- Fleet bar geometry.  A row of tappable ship chips across the bottom band; when more types are unlocked than
// fit the width, the row is dragged left/right to reach the rest (see the drag handling in create). ---
const CHIP_WIDTH = 132;
const CHIP_HEIGHT = 96;
const CHIP_GAP = 12;
const CHIP_ICON_BOX = 46;
// A pointer that moves more than this between press and release was a drag of the fleet bar, not a tap on a chip.
const DRAG_THRESHOLD = 10;

// --- Card / drawer button geometry, shared by the type card and the unlock drawer. ---
const BUTTON_WIDTH = 200;
const BUTTON_HEIGHT = 56;

// --- Unlock drawer geometry.  The panel is sized large enough that a two-column grid of every lockable type sits
// inside its frame with padding all round; the offsets below are measured from the panel's centre. ---
const DRAWER_PANEL_WIDTH = 680;
const DRAWER_PANEL_HEIGHT = 920;
// The window art carries a title bubble near its top; the heading sits in it, and the grid starts below it.
const DRAWER_HEADING_Y = -324;
const DRAWER_ROWS_Y = -186;
const DRAWER_CLOSE_Y = 372;
// The two columns' centres (±) and the vertical pitch between rows; each cell stacks a name over its unlock button.
const DRAWER_COLUMN_X = 150;
const DRAWER_ROW_HEIGHT = 108;
const DRAWER_UNLOCK_WIDTH = 244;
const DRAWER_UNLOCK_HEIGHT = 56;
// The type's silhouette rides on the left of its unlock button, with the "Unlock $x" label shifted right to clear it.
const DRAWER_ICON_BOX = 34;
const DRAWER_ICON_X = -84;
const DRAWER_LABEL_X = 24;

// One ship chip in the fleet bar: an icon over its live launch rate, on a button background that opens the card.
interface Chip {
	container: Phaser.GameObjects.Container
	icon: Phaser.GameObjects.Image
	rateText: Phaser.GameObjects.BitmapText
}

// The disabled tint / alpha an unaffordable button is drawn with, so cost + affordability read at a glance.
const AFFORD_TINT = 0xffffff;
const DENY_TINT = 0x8899aa;

// The sci-fi HUD + menus, drawn as a second scene running on top of the game so it never gets cleared by the
// simulation.  It is purely presentational: every frame it reads the GameScene's public getters (player money,
// fleet size, the per-type ShipRoster) and reflects them, and its interactive controls - the fleet bar chips, the
// type card's buy buttons, the unlock drawer, and the win/lose dialog - call straight back into the GameScene /
// its roster.  Art is from the spacegameguiset kit under public/ui; text is the Orbitron bitmap font.
export default class UIScene extends Phaser.Scene {
	private gameScene!: GameScene;

	private levelText!: Phaser.GameObjects.BitmapText;
	private moneyText!: Phaser.GameObjects.BitmapText;
	private fleetText!: Phaser.GameObjects.BitmapText;

	// The fleet bar: a draggable container of one chip per ship type (locked types stay hidden) plus a trailing
	// "＋" chip that opens the unlock drawer.
	private fleetBar!: Phaser.GameObjects.Container;
	private chips = new Map<ShipType, Chip>();
	private plusChip!: Phaser.GameObjects.Container;
	private fleetBarMinX = 0;
	private dragStartPointerX = 0;
	private dragStartBarX = 0;
	private dragging = false;

	// The per-type card, opened by tapping a chip: the type's stats and its two buy buttons.  One reusable card
	// retargeted to whichever type is open (null = closed).
	private card!: Phaser.GameObjects.Container;
	// A full-screen, invisible click-catcher shown behind the card so a tap anywhere off it closes the card.
	private cardBackdrop!: Phaser.GameObjects.Rectangle;
	private cardType: ShipType | null = null;
	private cardTitle!: Phaser.GameObjects.BitmapText;
	private cardStats!: Phaser.GameObjects.BitmapText;
	// A one-line preview of what the next Level buy grants this type (e.g. "Next level: +2 shields, +1 damage").
	private cardUpgradeText!: Phaser.GameObjects.BitmapText;
	private cardRateButton!: Phaser.GameObjects.Image;
	private cardRateLabel!: Phaser.GameObjects.BitmapText;
	private cardLevelButton!: Phaser.GameObjects.Image;
	private cardLevelLabel!: Phaser.GameObjects.BitmapText;

	// The unlock drawer: a modal list of the still-locked types and their unlock prices, rebuilt each time it opens
	// (and after an unlock) since the locked set shrinks as types are bought.
	private drawer!: Phaser.GameObjects.Container;
	private drawerRows!: Phaser.GameObjects.Container;
	private drawerEmpty!: Phaser.GameObjects.BitmapText;
	// One entry per locked-type cell currently in the drawer, so each frame's affordability pass can dim both the
	// unlock button and its ship icon without re-deriving which child is which (a cell now has two images).
	private drawerCells: Array<{ type: ShipType, button: Phaser.GameObjects.Image, icon: Phaser.GameObjects.Image }> = [];

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
		// The chips draw the same ship silhouettes the game does; load them here too so the UI scene is self-
		// sufficient (Phaser skips any key the GameScene has already loaded).
		this.load.image('boid', 'boid.png');
		for(const type of SHIP_TYPES) {
			this.load.image(type, SHIP_TYPE_DEFS[type].sprite);
		}
		// Phaser loads the .png atlas + its .fnt (BMFont XML) descriptor and renders any size from the baked glyphs.
		this.load.bitmapFont(FONT, 'ui/orbitron.png', 'ui/orbitron.fnt');
	}

	create() {
		this.gameScene = this.scene.get('game') as GameScene;
		const { width, height } = this.scale;

		// --- Top HUD band: level title, then player kill-reward money + fleet size on a second row ---
		// Bitmap glyphs are tinted with FILL mode: the tint colour replaces the glyph's RGB and only its alpha is
		// used for shape, so the text colours correctly no matter what colour the exported atlas glyphs are.
		this.levelText = this.add.bitmapText(width / 2, 30, FONT, '', 22)
			.setOrigin(0.5).setCenterAlign().setTintFill(0xcfe6ff);
		this.moneyText = this.add.bitmapText(24, 74, FONT, '', 28).setOrigin(0, 0.5).setTintFill(0xffd54a);
		this.fleetText = this.add.bitmapText(width - 24, 74, FONT, '', 18).setOrigin(1, 0.5).setTintFill(0x8fd6ff);

		this.buildFleetBar(height);
		this.buildCard(width, height);
		this.buildDrawer(width, height);
		this.buildDialog(width, height);
		this.buildStatsPanel(width);
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

		const state = this.gameScene.gameState;
		if(state !== 'playing' && this.dialogShownFor !== state) {
			this.showDialog(state);
		}

		// Only spend the string-building work when the overlay is actually on screen.
		if(this.statsVisible) {
			this.statsText.setText(formatStats(this.gameScene.stats));
		}
	}

	// --- Fleet bar -------------------------------------------------------------------------------------------

	private buildFleetBar(height: number) {
		const barY = height - HUD_BOTTOM_HEIGHT / 2;
		this.fleetBar = this.add.container(0, barY);

		// One chip per type, all built up front and shown/hidden + laid out each frame by refreshFleetBar; the icon
		// is the type's silhouette tinted the player's colour, over its live launch rate.
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

			// A press that did not turn into a drag of the whole bar opens this type's card.
			background.on('pointerup', () => {
				if(!this.dragging) {
					this.openCard(type);
				}
			});

			this.chips.set(type, { container, icon, rateText });
		}

		// The trailing "＋" chip: opens the unlock drawer.  Shown only while something is still locked.
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

		// Drag the whole bar horizontally to reach chips off the edge.  The scene-level pointer events fire whatever
		// is tapped, so they drive the drag while each chip's own pointerup still handles a tap - a gesture that
		// moves past DRAG_THRESHOLD sets `dragging`, which the chip handlers check to tell a scroll from a tap.
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

	// The fleet bar is only draggable while no overlay is up and the gesture is in the bottom band it lives in.
	private canDragFleetBar(pointer: Phaser.Input.Pointer, height: number): boolean {
		return !this.card.visible && !this.drawer.visible && !this.dialog.visible
			&& pointer.y >= height - HUD_BOTTOM_HEIGHT;
	}

	// Scales a ship icon to fit a square box of the given size without stretching its silhouette.
	private fitIcon(icon: Phaser.GameObjects.Image, box: number) {
		const scale = Math.min(box / icon.width, box / icon.height);
		icon.setScale(scale);
	}

	private refreshFleetBar(roster: ShipRoster) {
		const { width } = this.scale;
		// Gather the chips shown this frame in roster order, hiding the locked ones; the "＋" chip trails the last
		// unlocked one whenever anything is still locked.  The actual positioning + sizing happens in the pass below.
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
			// A chip glows brighter when either of its upgrades is affordable, hinting there is something to spend on.
			const canBuy = roster.canBuyRate(type) || roster.canBuyLevel(type);
			chip.container.setAlpha(canBuy ? 1 : 0.8);
			visible.push(chip.container);
		}

		this.plusChip.setVisible(anyLocked);
		if(anyLocked) {
			this.plusChip.setAlpha(roster.money >= this.cheapestUnlockCost(roster) ? 1 : 0.8);
			visible.push(this.plusChip);
		}

		if(visible.length === 0) {
			return;
		}

		// Fit the whole row on screen at once.  The chips keep their natural size while the row fits, then shrink
		// uniformly once it would overflow the available width - so they all stay visible no matter how many are
		// unlocked.  The row is centred, so a couple of chips sit in the middle rather than pinned to the left edge.
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

		// The row always fits now, so the bar itself never needs to be scrolled.
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
		// The card sits just above the fleet bar, centred on the canvas width.  The offset clears its taller frame so
		// the bottom edge still stops short of the fleet bar band below.
		const cardY = height - HUD_BOTTOM_HEIGHT - 200;

		// A full-screen click-catcher behind the card (invisible, but interactive): a tap that lands here - i.e. off
		// the card - closes it.  The panel below is made interactive too so taps on the card's own blank areas hit it
		// (Phaser delivers only to the top-most object) and are swallowed rather than falling through to this backdrop.
		this.cardBackdrop = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0)
			.setInteractive()
			.setDepth(49)
			.setVisible(false);
		this.cardBackdrop.on('pointerup', () => this.closeCard());

		// A touch taller than the two-line card it grew from, to seat the extra combat-stat line and the next-level
		// preview above the buy buttons without crowding them.
		const panel = this.add.image(0, 0, 'ui-window').setDisplaySize(460, 360).setInteractive();

		this.cardTitle = this.add.bitmapText(0, -132, FONT, '', 26).setOrigin(0.5).setCenterAlign().setTintFill(0xcfe6ff);
		this.cardStats = this.add.bitmapText(0, -58, FONT, '', 18).setOrigin(0.5).setCenterAlign().setTintFill(0x8fd6ff);
		// The next-level preview sits between the stats and the buttons, tinted gold like the money read so it draws the
		// eye to what a Level buy pays for.
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

		// A small close control in the card's top-right corner.
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

		// The last stat line is the type's own offence - its bullet / missile / blast damage, or a Carrier's drone
		// count - so each card names what it fights with instead of a generic "damage".
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
		// Tapping the dimmed backdrop closes the drawer.
		overlay.on('pointerup', () => this.closeDrawer());

		// The panel is made interactive so a tap on its blank frame is swallowed here (Phaser delivers only to the
		// top-most object) instead of falling through to the backdrop overlay behind it and closing the drawer.
		const panel = this.add.image(width / 2, height / 2, 'ui-window').setDisplaySize(DRAWER_PANEL_WIDTH, DRAWER_PANEL_HEIGHT)
			.setInteractive();
		const heading = this.add.bitmapText(width / 2, height / 2 + DRAWER_HEADING_Y, FONT, 'UNLOCK SHIPS', 30)
			.setOrigin(0.5).setCenterAlign().setTintFill(0xcfe6ff);
		this.drawerEmpty = this.add.bitmapText(width / 2, height / 2, FONT, 'Every ship is unlocked.', 20)
			.setOrigin(0.5).setCenterAlign().setTintFill(0x8fd6ff).setVisible(false);

		// The rows live in their own container so a rebuild only clears/rebuilds this, not the panel + heading.
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

	// Rebuild the list of locked-type cells from scratch: the locked set only changes on an unlock, so this runs on
	// open and after each unlock rather than every frame.  Laid out in two columns so the whole roster (up to ~10
	// types) fits the panel without scrolling; each cell stacks the type's name over its unlock button.
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
			// The type's silhouette sits on the left of the button (drawn after it so it rides on top), tinted the
			// player's colour like its ships; the price label shifts right to make room.
			const icon = this.add.image(x + DRAWER_ICON_X, y + 18, this.textures.exists(type) ? type : 'boid')
				.setTint(this.gameScene.playerColor);
			this.fitIcon(icon, DRAWER_ICON_BOX);
			const label = this.add.bitmapText(x + DRAWER_LABEL_X, y + 18, FONT, `Unlock  $${roster.unlockCost(type)}`, 15)
				.setOrigin(0.5).setCenterAlign().setTintFill(0xffffff);
			button.on('pointerup', () => {
				if(roster.unlock(type)) {
					// A successful unlock drops this type off the locked list, so rebuild it (and reveal its chip).
					this.rebuildDrawerRows(roster);
				}
			});

			this.drawerRows.add([name, button, icon, label]);
			this.drawerCells.push({ type, button, icon });
		});
	}

	// Each frame the drawer is open: keep each cell's affordability in step with the player's money as it ticks up
	// from kills, dimming both the unlock button and its ship icon when the type is out of reach.
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
		button.on('pointerup', () => {
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
		// A finished match freezes the roster UI behind the dialog so it can't be tapped through the overlay.
		this.closeCard();
		this.closeDrawer();
		if(state === 'won') {
			this.dialogTitle.setText('VICTORY').setTintFill(0x7cfc66);
			const next = this.gameScene.hasNextLevel
				? '\nYour fleet carries into the next battle.'
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
