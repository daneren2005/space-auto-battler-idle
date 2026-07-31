import Phaser from 'phaser';
import { PerformanceTiming } from '@daneren2005/shared-memory-ecs';
import type { BaseEntity, PerformanceStats } from '@daneren2005/shared-memory-ecs';
import { POSITION_UPDATED_EVENT } from '@daneren2005/shared-memory-physics';
import prettyMemory from '@/data/pretty-memory';
import type { LevelConfig } from '@/data/levels';
import { getLevelIndex } from '@/data/levels';
import type { Carry } from '@/data/progress';
import { saveProgress, resetProgress } from '@/data/progress';
import type { Components } from './components';
import { CONTROLLER_MONEY, CONTROLLER_SHIPS_PER_SECOND, CONTROLLER_SHIP_SHIELDS } from './components/controller';
import { playAreaViewport } from './display';
import type GameWorld from './entities/game-world';

// A live entity as this scene sees it: the world's entity type narrowed to this game's component map.
type GameEntity = BaseEntity<Components>;

// The pair of images one entity is drawn with: its hull, and the shield bubble that rides on top of it.  The
// shield hangs off the hull rather than living in a second map so a sync only costs one lookup.
type EntitySprite = Phaser.GameObjects.Image & {
	shieldImage: Phaser.GameObjects.Image
};

// A single station's ship tally, used to render the per-team breakdown in the debug panel.
export interface StationShipStat {
	eid: number
	color: number
	displayColor: string
	ships: number
}

// A full snapshot of everything the debug panel displays.  The scene owns the game loop, so it is the single
// source of truth for these numbers; the UI scene is purely presentational.
export interface GameStats {
	// Phaser's own smoothed frame rate, so the panel shows what the renderer is actually managing alongside the
	// time our update costs.
	fps: number
	// What the world costs to run, straight off the library's PerformanceTiming: `update` is one world.update on
	// this thread, `systems` is each system's worker run and the events it reported back, and `events` is every
	// system's event handling added together.
	timing: PerformanceStats
	memory: string
	stationsCount: number
	shipsCount: number
	totalCount: number
	stationShips: Array<StationShipStat>
}

// Whether the match is still being played, or has been won / lost by the player.
export type GameState = 'playing' | 'won' | 'lost';

export interface GameSceneOptions {
	world: GameWorld
	level: LevelConfig
	// Upgrades / money carried over from earlier levels, applied to the player's station on load.
	carry: Carry
	// Whether finishing this level writes the saved campaign progress.  Defaults to true; the stress-test level
	// turns it off so a scratch battle can't advance (or wipe) a real run.
	persistProgress?: boolean
}

// An empty snapshot so the `stats` getter always returns a well-formed object, even before the first reporting
// window has elapsed.
const EMPTY_GAME_STATS: GameStats = {
	fps: 0,
	timing: {
		update: { avg: 0, min: 0, max: 0, samples: 0 },
		systems: [],
		events: { avg: 0, min: 0, max: 0, samples: 0 },
	},
	memory: '',
	stationsCount: 0,
	shipsCount: 0,
	totalCount: 0,
	stationShips: [],
};

// The Phaser scene that plays the shared-memory-ecs game: it loads the level, kicks off the world, and every
// frame runs the simulation and syncs a sprite (+ shield) for each live entity.  It also owns the "game" side
// of the meta-game: which faction the player is, that faction's kill-reward money, buying ship-rate upgrades,
// and detecting a win (no enemies left) or loss (the player's station destroyed).  The sci-fi HUD, upgrade
// panel and win/lose dialogs are drawn by the parallel UIScene, which reads this scene's public getters.
export default class GameScene extends Phaser.Scene {
	private world: GameWorld;
	private level: LevelConfig;
	private carry: Carry;
	private persistProgress: boolean;

	// The most recent debug-stats snapshot, refreshed ~once a second.  The UIScene reads this to render the
	// in-game debug overlay (toggled with the backtick key).
	private latestStats: GameStats = EMPTY_GAME_STATS;

	// Measures what the world costs to run - the update on this thread, and each system's run + event handling -
	// by listening to the world's own events, so nothing here has to time anything by hand.  It reports a fresh
	// snapshot roughly once a second, which is what drives the panel's refresh.
	private timing: PerformanceTiming<Components>;

	private paused = false;
	private eidSpriteMap = new Map<number, EntitySprite>();

	// The station eid the human plays; -1 until the level is loaded.  Only this faction's money is spendable.
	private playerStationEid = -1;
	private state: GameState = 'playing';

	private stationShips: Array<StationShipStat> = [];

	constructor(options: GameSceneOptions) {
		super('game');
		this.world = options.world;
		this.level = options.level;
		this.carry = options.carry;
		this.persistProgress = options.persistProgress ?? true;
		// The world builds its systems in its own constructor, so every one of them is already there to be tracked.
		this.timing = new PerformanceTiming(this.world);
	}

	preload() {
		this.load.image('boid', 'boid.png');
		this.load.image('station', 'station.png');
		this.load.image('shield', 'shield3.png');
	}

	create() {
		this.world.load({ entities: this.level.entities, bounds: this.level.bounds });

		// The canvas is a fixed size (DISPLAY_*), and the battle only gets the strip between the HUD's top text
		// and its bottom buttons - so point the game camera at exactly that strip and zoom so this level's world
		// bounds fill it, centred on the world.  A small level zooms in, a large one zooms out - either way the
		// UIScene, which has its own full-canvas camera, is untouched, so the HUD/menus never change size with
		// the level, and no station can be drawn underneath them.
		const { width, height } = this.scale;
		const viewport = playAreaViewport(width, height);
		const bounds = this.level.bounds;
		const zoom = Math.min(viewport.width / bounds.width, viewport.height / bounds.height);
		this.cameras.main.setViewport(viewport.x, viewport.y, viewport.width, viewport.height);
		this.cameras.main.setZoom(zoom);
		this.cameras.main.centerOn(bounds.width / 2, bounds.height / 2);

		// PerformanceTiming closes a reporting window roughly once a second; ride it for the rest of the panel so
		// the whole snapshot is from the same moment.  It fires at the tail of world.update, after it has banked
		// that frame's cost, so the sweep below is not counted against the frame it happens on.
		this.timing.on('stats-updated', () => {
			this.refreshStats();
			this.syncAllSprites();
		});
		this.events.once('shutdown', () => this.timing.destroy());

		// Destroy a sprite as soon as its entity is removed (killEntityWorker -> world removes it).  The move
		// listener added in addSprite goes with the entity itself, which the world drops at the same time.
		this.world.on('entity-removed', (entity: { eid: number }) => {
			let sprite = this.eidSpriteMap.get(entity.eid);
			if(sprite) {
				sprite.destroy();
				sprite.shieldImage.destroy();
				this.eidSpriteMap.delete(entity.eid);
			}
		});

		// Give every entity in the level its sprite up front, and every entity spawned later one as it arrives, so
		// nothing has to check for a missing sprite on the hot path.  Done after `load` rather than through
		// `entity-added` for the level's own entities because a ship takes its colour from the station that owns
		// it, which is only guaranteed to exist once the whole scene is in.
		this.world.entities.forEach(entity => this.addSprite(entity));
		this.world.on('entity-added', (entity: GameEntity) => this.addSprite(entity));

		let stations = this.world.entities.filter(entity => entity.components.controller);
		this.stationShips = stations.map(station => {
			let color = station.components.controller!.color;
			let displayColor = '#' + color.toString(16);
			if(displayColor === '#ffffff') {
				displayColor = '#000000';
			}

			return {
				eid: station.eid,
				color,
				displayColor,
				ships: 0,
			};
		});

		// The player faction is the (single) controller flagged `player` in the level.
		this.playerStationEid = stations.find(station => station.components.controller!.player)?.eid ?? -1;

		// Apply carried-over progress on top of this level's bases for the player.  Nothing has simulated yet,
		// so plain writes here are safe (no worker is touching the block until the first update next frame).
		const playerController = this.playerController;
		if(playerController) {
			playerController.shipsPerSecond += this.carry.shipRateUpgrades;
			playerController.shipShields += this.carry.shieldUpgrades;
			playerController.money += this.carry.money;
			// Keep the upgrade counts cumulative so the next upgrade's cost continues from where it left off.
			playerController.upgrades += this.carry.shipRateUpgrades;
			playerController.shieldUpgrades += this.carry.shieldUpgrades;
		}

		this.input.keyboard?.on('keydown-SPACE', () => {
			if(this.state === 'playing') {
				this.paused = !this.paused;
			}
		});

		// Draw the HUD / dialogs on top; it reads this scene back via this.scene.get('game').
		this.scene.launch('ui');

		// Push an initial snapshot so the panel is populated before the first reporting window elapses.
		this.refreshStats();
	}

	update(time: number, delta: number) {
		if(this.paused || this.state !== 'playing') {
			return;
		}

		// The world runs in milliseconds, which is Phaser's delta as it comes and what shared-memory-physics
		// measures elapsedTime in.  Sprites are no longer synced from here: each move arrives as a
		// POSITION_UPDATED_EVENT once the physics run that made it completes (see addSprite), so this frame costs
		// nothing per entity that did not move.
		this.world.update(delta);

		this.checkForGameOver();
	}

	// Builds the hull + shield pair an entity is drawn with, puts it where the entity currently stands, and
	// subscribes to the moves physics reports for it.  Anything without a transform - there is nowhere to draw it -
	// is skipped.
	private addSprite(entity: GameEntity) {
		const transform = entity.components.transform;
		if(!transform || this.eidSpriteMap.has(entity.eid)) {
			return;
		}

		// `shieldImage` is attached straight after, which is what makes this an EntitySprite rather than a bare
		// Image; Phaser's factory can only hand back the latter.
		const sprite = this.add.image(0, 0, entity.components.controller ? 'station' : 'boid') as EntitySprite;
		sprite.setScale(transform.width / sprite.width, transform.height / sprite.height);
		sprite.shieldImage = this.add.image(0, 0, 'shield');
		// The shield art points up (front-to-back runs along its Y axis) whereas the entity's `width` is its
		// front-to-back length, so map width -> shield Y and height -> shield X to keep it skinny like the ship.
		sprite.shieldImage.setScale(transform.height / sprite.shieldImage.width * 2, transform.width / sprite.shieldImage.height * 2);
		sprite.setTint(this.getTint(entity.eid));
		this.eidSpriteMap.set(entity.eid, sprite);

		// The physics system reports where an entity ended up on the entity itself, once the run that moved it
		// completes - so a sprite only costs anything on the runs its entity actually moved, rather than every
		// entity costing a sync every frame whether it went anywhere or not.
		entity.on(POSITION_UPDATED_EVENT, (x: number, y: number) => {
			this.syncSprite(entity, sprite, x, y);
		});

		// Nothing has moved yet, so place it where it starts.
		this.syncSprite(entity, sprite, transform.x, transform.y);
	}

	// Puts one entity's sprite where the entity is.  `x` / `y` are passed in because the move event carries them,
	// which saves reading them back out of the shared block on the hot path.
	private syncSprite(entity: GameEntity, sprite: EntitySprite, x: number, y: number) {
		// x/y are the centre of the transform, which is where Phaser draws an image from by default.
		sprite.x = sprite.shieldImage.x = x;
		sprite.y = sprite.shieldImage.y = y;

		// `rotation`, not `angle`: the transform's facing is in radians (0 pointing right, as Phaser has it).
		// Facing is not part of the move event, so it still comes off the transform - which lives in shared
		// memory, so it already holds whatever the worker wrote during the run that reported this move.
		const angle = entity.components.transform?.angle ?? 0;
		sprite.rotation = angle;
		// The shield art has its front edge at the top rather than the right, so turn it a quarter turn further
		// to line its front up with the heading.
		sprite.shieldImage.rotation = angle + Math.PI / 2;
		sprite.shieldImage.visible = (entity.components.health?.shields ?? 0) > 0;
	}

	// Catches up everything the move events cannot: shields drain and regenerate in shared memory without an
	// event of their own, and an entity that is standing still - a station, and in future a ship holding station -
	// gets no move to hang the check off.  Cheap enough to run once a second over the whole world.
	private syncAllSprites() {
		this.world.entities.forEach(entity => {
			const sprite = this.eidSpriteMap.get(entity.eid);
			const transform = entity.components.transform;
			if(sprite && transform) {
				this.syncSprite(entity, sprite, transform.x, transform.y);
			}
		});
	}

	// --- Meta-game state the UIScene renders ------------------------------------------------------------

	get gameState(): GameState {
		return this.state;
	}

	// The latest debug-stats snapshot, rendered by the UIScene's in-game overlay.
	get stats(): GameStats {
		return this.latestStats;
	}

	get levelTitle(): string {
		return this.level.title;
	}

	// The HUD's heading for this level: its 1-based position in the play order and its title.  A level that isn't
	// in the play order at all (the stress test) has no number, so it shows its title on its own rather than
	// claiming to be "Level 0".
	get levelLabel(): string {
		const index = getLevelIndex(this.level.name);
		return index >= 0 ? `Level ${index + 1}: ${this.level.title}` : this.level.title;
	}

	// The player faction's kill-reward money.  A plain read is fine for display; workers only ever add to it.
	get playerMoney(): number {
		return this.playerController?.money ?? 0;
	}

	// How fast this faction launches new ships, and how many of them are flying right now.  There is no cap on
	// the fleet, so the second number is only ever a snapshot of spawns minus deaths.
	get playerShipsPerSecond(): number {
		return this.playerController?.shipsPerSecond ?? 0;
	}
	get playerShips(): number {
		return this.world.entities.filter(entity => entity.components.controlled?.owner === this.playerStationEid).length;
	}

	// Cost of the next ship-rate upgrade: 1, 2, 4, 8, ... (doubles with each one bought).
	get upgradeCost(): number {
		return 2 ** (this.playerController?.upgrades ?? 0);
	}
	get canAffordUpgrade(): boolean {
		const controller = this.playerController;
		return !!controller && controller.money >= this.upgradeCost;
	}

	// Spend money to launch one more ship a second.  Returns whether the purchase went through.
	buyUpgrade(): boolean {
		const controller = this.playerController;
		if(!controller || controller.money < this.upgradeCost) {
			return false;
		}

		const cost = this.upgradeCost;
		// money is mutated by collision workers and shipsPerSecond is read by the spawn worker, so touch the shared
		// block atomically; upgrades is only ever written here, so a plain increment is safe.
		const block = this.world.registry.controller.memoryComponent.getBlock(controller.index) as Int32Array;
		Atomics.sub(block, CONTROLLER_MONEY, cost);
		Atomics.add(block, CONTROLLER_SHIPS_PER_SECOND, 1);
		controller.upgrades += 1;
		return true;
	}

	// The player faction's per-ship shield count, and the exponential cost of the next shield upgrade: 5, 10,
	// 20, 40, ... (starts at 5, doubles each time).
	get playerShipShields(): number {
		return this.playerController?.shipShields ?? 0;
	}
	get shieldUpgradeCost(): number {
		return 5 * 2 ** (this.playerController?.shieldUpgrades ?? 0);
	}
	get canAffordShieldUpgrade(): boolean {
		const controller = this.playerController;
		return !!controller && controller.money >= this.shieldUpgradeCost;
	}

	// Spend money to give every future ship this faction spawns one more shield.  Returns whether it went through.
	buyShieldUpgrade(): boolean {
		const controller = this.playerController;
		if(!controller || controller.money < this.shieldUpgradeCost) {
			return false;
		}

		const cost = this.shieldUpgradeCost;
		// money is mutated by collision workers and shipShields is read by the spawn worker, so touch the shared
		// block atomically; shieldUpgrades is only ever written here, so a plain increment is safe.
		const block = this.world.registry.controller.memoryComponent.getBlock(controller.index) as Int32Array;
		Atomics.sub(block, CONTROLLER_MONEY, cost);
		Atomics.add(block, CONTROLLER_SHIP_SHIELDS, 1);
		controller.shieldUpgrades += 1;
		return true;
	}

	// --- Win/lose dialog + level progression ------------------------------------------------------------

	get hasNextLevel(): boolean {
		return !!this.level.nextLevel && getLevelIndex(this.level.nextLevel) >= 0;
	}

	get dialogButtonLabel(): string {
		if(this.state === 'won') {
			return this.hasNextLevel ? 'Next Level' : 'Play Again';
		}
		return 'Retry';
	}

	// Fired by the dialog button.  A win advances to (and persists) the next level carrying the player's upgrades
	// forward - or, after the last level, wipes progress for a fresh run.  A loss leaves the saved progress alone
	// so the reload simply retries this level with the same carry it started with.  A reload is the cleanest
	// reliable reset of the world + workers - and for a level outside the campaign (persistProgress off) it is
	// the whole action: replay it without touching the saved run.
	dialogAction(): void {
		if(!this.persistProgress) {
			window.location.reload();
			return;
		}

		if(this.state === 'won' && this.level.nextLevel) {
			const nextIndex = getLevelIndex(this.level.nextLevel);
			if(nextIndex >= 0) {
				saveProgress({ levelIndex: nextIndex, carry: this.currentCarry() });
			}
		} else if(this.state === 'won') {
			resetProgress();
		}
		window.location.reload();
	}

	private currentCarry(): Carry {
		const controller = this.playerController;
		return {
			shipRateUpgrades: controller?.upgrades ?? 0,
			shieldUpgrades: controller?.shieldUpgrades ?? 0,
			money: controller?.money ?? 0,
		};
	}

	private get playerController() {
		return this.world.getEntityByEid(this.playerStationEid)?.components.controller;
	}

	private checkForGameOver() {
		const controllers = this.world.entities.filter(entity => entity.components.controller);
		const playerAlive = controllers.some(entity => entity.eid === this.playerStationEid);
		if(!playerAlive) {
			this.state = 'lost';
			return;
		}

		const enemiesAlive = controllers.some(entity => entity.eid !== this.playerStationEid);
		if(!enemiesAlive) {
			this.state = 'won';
		}
	}

	private getTint(eid: number): number {
		let entity = this.world.getEntityByEid(eid);
		if(entity?.components.controller) {
			return entity.components.controller.color;
		} else if(entity?.components.controlled) {
			return this.world.getEntityByEid(entity.components.controlled.owner)?.components.controller?.color ?? 0xffffff;
		}
		return 0xffffff;
	}

	private hasComponent(eid: number, name: 'controller' | 'controlled'): boolean {
		return !!this.world.getEntityByEid(eid)?.components[name];
	}

	private refreshStats() {
		let stations = this.world.entities.filter(entity => this.hasComponent(entity.eid, 'controller'));
		let ships = this.world.entities.filter(entity => this.hasComponent(entity.eid, 'controlled'));

		this.stationShips.forEach(val => {
			let matchingStation = stations.find(station => station.components.controller!.color === val.color);
			if(matchingStation) {
				val.ships = ships.filter(ship => ship.components.controlled!.owner === matchingStation.eid).length;
			} else {
				val.ships = 0;
			}
		});

		this.latestStats = {
			fps: this.game.loop.actualFps,
			// Replaced wholesale each window, so it is safe to hand straight out.
			timing: this.timing.stats,
			memory: prettyMemory(this.world.heap),
			stationsCount: stations.length,
			shipsCount: ships.length,
			totalCount: this.world.entities.length,
			// Copy so the consumer can't mutate the scene's internal array.
			stationShips: this.stationShips.map(stat => ({ ...stat })),
		};
	}
}
