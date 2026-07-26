import Phaser from 'phaser';
import generateScene from '@/data/generate-scene';
import prettyMemory from '@/data/pretty-memory';
import type GameWorld from './entities/game-world';

// A single station's ship tally, used to render the per-team breakdown in the UI panel.
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

// A full snapshot of everything the UI panel displays.  The scene owns the game loop and worker timing, so it
// is the single source of truth for these numbers; the Vue component is purely presentational.
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

export interface GameSceneOptions {
	world: GameWorld
	width: number
	height: number
	// Called roughly once per second with a fresh snapshot of the game's stats.
	onStats: (stats: GameStats) => void
}

// The Phaser scene that plays the shared-memory-ecs game: it loads the sprites, kicks off the world, and every
// frame runs the simulation and syncs a sprite (+ shield) for each live entity.  All timing/stat collection
// lives here and is pushed out via `onStats` so the surrounding Vue component only has to render.
export default class GameScene extends Phaser.Scene {
	private world: GameWorld;
	private worldWidth: number;
	private worldHeight: number;
	private onStats: (stats: GameStats) => void;

	private paused = false;
	private eidSpriteMap = new Map<number, any>();

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
		this.worldWidth = options.width;
		this.worldHeight = options.height;
		this.onStats = options.onStats;
	}

	preload() {
		this.load.image('boid', 'boid.png');
		this.load.image('station', 'station.png');
		this.load.image('shield', 'shield3.png');
	}

	create() {
		this.world.load(generateScene({
			stations: 10,
			shipsPerStation: 100,
			width: this.worldWidth,
			height: this.worldHeight,
		}));

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

		this.input.keyboard?.on('keydown-SPACE', () => {
			this.paused = !this.paused;
		});

		// Push an initial snapshot so the panel is populated before the first reporting window elapses.
		this.refreshStats();
	}

	update(time: number, delta: number) {
		if(this.paused) {
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
				sprite.shieldImage.setScale(position.width / sprite.shieldImage.width * 2, position.height / sprite.shieldImage.height * 2);
				sprite.setTint(this.getTint(entity.eid));
				this.eidSpriteMap.set(entity.eid, sprite);
			}

			sprite.x = sprite.shieldImage.x = position.x;
			sprite.y = sprite.shieldImage.y = position.y;
			sprite.angle = sprite.shieldImage.angle = position.angle;
			sprite.shieldImage.visible = (entity.components.health?.shields ?? 0) > 0;
		});

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

	private hasComponent(eid: number, name: 'controller' | 'controlled'): boolean {
		return !!this.world.getEntityByEid(eid)?.components[name];
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

		this.onStats({
			maxUpdateTime: this.maxUpdateTime,
			avgUpdateTime: this.avgUpdateTime,
			memory: prettyMemory(this.world.heap),
			stationsCount: stations.length,
			shipsCount: ships.length,
			totalCount: this.world.entities.length,
			// Copy so the consumer can't mutate the scene's internal array.
			stationShips: this.stationShips.map(stat => ({ ...stat })),
			systemUpdates,
		});
	}
}
