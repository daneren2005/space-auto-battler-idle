import Phaser from 'phaser';
import prettyMemory from '@/data/pretty-memory';
import type { LevelConfig } from '@/data/levels';
import { getLevelIndex } from '@/data/levels';
import type { Carry } from '@/data/progress';
import { saveProgress, resetProgress } from '@/data/progress';
import { CONTROLLER_MONEY, CONTROLLER_OPEN_SHIPS, CONTROLLER_SHIP_SHIELDS } from './components/controller';
import { playAreaViewport } from './display';
import type GameWorld from './entities/game-world';

// A single station's ship tally, used to render the per-team breakdown in the debug panel.
export interface StationShipStat {
	eid: number
	color: number
	displayColor: string
	ships: number
}

// One system's off-thread run time, averaged/maxed over the last reporting window.
export interface SystemStat {
	name: string
	avg: number
	max: number
}

// A full snapshot of everything the debug panel displays.  The scene owns the game loop and worker timing, so
// it is the single source of truth for these numbers; the UI scene is purely presentational.
export interface GameStats {
	maxUpdateTime: number
	avgUpdateTime: number
	memory: string
	stationsCount: number
	shipsCount: number
	totalCount: number
	stationShips: Array<StationShipStat>
	systemUpdates: Array<SystemStat>
}

// Whether the match is still being played, or has been won / lost by the player.
export type GameState = 'playing' | 'won' | 'lost';

export interface GameSceneOptions {
	world: GameWorld
	level: LevelConfig
	// Upgrades / money carried over from earlier levels, applied to the player's station on load.
	carry: Carry
}

// An empty snapshot so the `stats` getter always returns a well-formed object, even before the first
// reporting window has elapsed.
const EMPTY_STATS: GameStats = {
	maxUpdateTime: 0,
	avgUpdateTime: 0,
	memory: '',
	stationsCount: 0,
	shipsCount: 0,
	totalCount: 0,
	stationShips: [],
	systemUpdates: [],
};

// The Phaser scene that plays the shared-memory-ecs game: it loads the level, kicks off the world, and every
// frame runs the simulation and syncs a sprite (+ shield) for each live entity.  It also owns the "game" side
// of the meta-game: which faction the player is, that faction's kill-reward money, buying openShip upgrades,
// and detecting a win (no enemies left) or loss (the player's station destroyed).  The sci-fi HUD, upgrade
// panel and win/lose dialogs are drawn by the parallel UIScene, which reads this scene's public getters.
export default class GameScene extends Phaser.Scene {
	private world: GameWorld;
	private level: LevelConfig;
	private carry: Carry;

	// The most recent debug-stats snapshot, refreshed ~once a second.  The UIScene reads this to render the
	// in-game debug overlay (toggled with the backtick key).
	private latestStats: GameStats = EMPTY_STATS;

	private paused = false;
	private eidSpriteMap = new Map<number, any>();

	// The station eid the human plays; -1 until the level is loaded.  Only this faction's money is spendable.
	private playerStationEid = -1;
	private state: GameState = 'playing';

	private updateTicks = 0;
	private updateTimes: Array<number> = [];
	private maxUpdateTime = 0;
	private avgUpdateTime = 0;

	// Per-system worker run times, keyed by system name, collected from the world's worker-finished events.
	private systemRunTimes: { [name: string]: Array<number> } = {};
	private stationShips: Array<StationShipStat> = [];

	constructor(options: GameSceneOptions) {
		super('game');
		this.world = options.world;
		this.level = options.level;
		this.carry = options.carry;
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

		// Record each system's worker run time so the panel can show off-thread cost.
		this.world.systems.forEach(system => {
			this.systemRunTimes[system.name] = [];
			this.world.on(`system-${system.name}-worker-finished`, (runTime: number) => {
				this.systemRunTimes[system.name].push(runTime);
			});
		});

		// Destroy a sprite as soon as its entity is removed (killEntityWorker -> world removes it).
		this.world.on('entity-removed', (entity: { eid: number }) => {
			let sprite = this.eidSpriteMap.get(entity.eid);
			if(sprite) {
				sprite.destroy();
				sprite.shieldImage.destroy();
				this.eidSpriteMap.delete(entity.eid);
			}
		});

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
			playerController.openShips += this.carry.openShipUpgrades;
			playerController.shipShields += this.carry.shieldUpgrades;
			playerController.money += this.carry.money;
			// Keep the upgrade counts cumulative so the next upgrade's cost continues from where it left off.
			playerController.upgrades += this.carry.openShipUpgrades;
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

		let start = performance.now();
		this.world.update(delta / 1_000);

		// Sync a sprite for every live entity that has a position.
		this.world.entities.forEach(entity => {
			let position = entity.components.position;
			if(!position) {
				return;
			}

			let sprite = this.eidSpriteMap.get(entity.eid);
			if(!sprite) {
				sprite = this.add.image(0, 0, entity.components.controller ? 'station' : 'boid');
				sprite.setScale(position.width / sprite.width, position.height / sprite.height);
				sprite.shieldImage = this.add.image(0, 0, 'shield');
				// The shield art points up (front-to-back runs along its Y axis) whereas the entity's `width` is its
				// front-to-back length, so map width -> shield Y and height -> shield X to keep it skinny like the ship.
				sprite.shieldImage.setScale(position.height / sprite.shieldImage.width * 2, position.width / sprite.shieldImage.height * 2);
				sprite.setTint(this.getTint(entity.eid));
				this.eidSpriteMap.set(entity.eid, sprite);
			}

			sprite.x = sprite.shieldImage.x = position.x;
			sprite.y = sprite.shieldImage.y = position.y;
			sprite.angle = position.angle;
			// The shield art has its front edge at the top, but position.angle follows Phaser's convention
			// where 0deg points right; offset by 90deg so the shield's front lines up with the heading.
			sprite.shieldImage.angle = position.angle + 90;
			sprite.shieldImage.visible = (entity.components.health?.shields ?? 0) > 0;
		});

		this.checkForGameOver();

		let end = performance.now();
		this.updateTimes.push(end - start);
		this.updateTicks += delta;
		if(this.updateTicks > 1_000) {
			this.maxUpdateTime = this.updateTimes.reduce((max, sample) => Math.max(max, sample), 0);
			this.avgUpdateTime = this.updateTimes.reduce((total, sample) => total + sample, 0) / this.updateTimes.length;
			this.updateTimes = [];
			this.updateTicks = 0;

			this.refreshStats();
		}
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

	// The level's 1-based position in the play order, for the HUD's "Level N" label.
	get levelNumber(): number {
		return getLevelIndex(this.level.name) + 1;
	}

	// The player faction's kill-reward money.  A plain read is fine for display; workers only ever add to it.
	get playerMoney(): number {
		return this.playerController?.money ?? 0;
	}

	// Ship slots this faction can still spend, plus the ships already flying.
	get playerOpenShips(): number {
		return this.playerController?.openShips ?? 0;
	}
	get playerShips(): number {
		return this.world.entities.filter(entity => entity.components.controlled?.owner === this.playerStationEid).length;
	}
	// The biggest fleet this faction could field right now: the ships already flying plus the unspent slots each
	// of which will become another ship.
	get playerTotalFleet(): number {
		return this.playerShips + this.playerOpenShips;
	}

	// Cost of the next openShip upgrade: 1, 2, 4, 8, ... (doubles with each one bought).
	get upgradeCost(): number {
		return 2 ** (this.playerController?.upgrades ?? 0);
	}
	get canAffordUpgrade(): boolean {
		const controller = this.playerController;
		return !!controller && controller.money >= this.upgradeCost;
	}

	// Spend money to add one openShip slot to the player's bank.  Returns whether the purchase went through.
	buyUpgrade(): boolean {
		const controller = this.playerController;
		if(!controller || controller.money < this.upgradeCost) {
			return false;
		}

		const cost = this.upgradeCost;
		// money + openShips are also mutated by collision/spawn workers on other threads, so touch the shared
		// block atomically; upgrades is only ever written here, so a plain increment is safe.
		const block = this.world.registry.controller.memoryComponent.getBlock(controller.index) as Int32Array;
		Atomics.sub(block, CONTROLLER_MONEY, cost);
		Atomics.add(block, CONTROLLER_OPEN_SHIPS, 1);
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
	// reliable reset of the world + workers.
	dialogAction(): void {
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
			openShipUpgrades: controller?.upgrades ?? 0,
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

		let systemUpdates = this.world.systems.map(system => {
			let times = this.systemRunTimes[system.name] ?? [];
			let stats = {
				name: system.name,
				avg: times.length ? times.reduce((total, time) => total + time, 0) / times.length : 0,
				max: times.reduce((max, time) => Math.max(max, time), 0),
			};
			this.systemRunTimes[system.name] = [];
			return stats;
		});

		this.latestStats = {
			maxUpdateTime: this.maxUpdateTime,
			avgUpdateTime: this.avgUpdateTime,
			memory: prettyMemory(this.world.heap),
			stationsCount: stations.length,
			shipsCount: ships.length,
			totalCount: this.world.entities.length,
			// Copy so the consumer can't mutate the scene's internal array.
			stationShips: this.stationShips.map(stat => ({ ...stat })),
			systemUpdates,
		};
	}
}
