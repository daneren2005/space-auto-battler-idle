import Phaser from 'phaser';
import { PerformanceTiming } from '@daneren2005/shared-memory-ecs';
import type { BaseEntity, PerformanceStats } from '@daneren2005/shared-memory-ecs';
import {
	INTERPOLATION_X_INDEX,
	INTERPOLATION_Y_INDEX,
	TRANSFORM_X_INDEX,
	TRANSFORM_Y_INDEX,
	TRANSFORM_ANGLE_INDEX,
} from '@daneren2005/shared-memory-physics';
import prettyMemory from '@/data/pretty-memory';
import type { LevelConfig } from '@/data/levels';
import { getLevelIndex, levels, firstLevel } from '@/data/levels';
import type { Carry } from '@/data/progress';
import { saveProgress, resetProgress, progressAfterMatch, emptyCarry } from '@/data/progress';
import type { Components } from './components';
import { carryFromStation } from './player-carry';
import {
	hangarRateIndex,
	hangarLevelIndex,
	hangarRateBoughtIndex,
	hangarLevelBoughtIndex,
} from './components/hangar';
import { HEALTH_SHIELDS } from './components/health';
import { DETONATED_EVENT } from './components/combat';
import { SHIP_TYPES, SHIP_TYPE_INDEX, SHIP_TYPE_DEFS, isShipType } from '@/data/ship-types';
import ShipRoster from './ship-roster';
import { playAreaViewport } from './display';
import type GameWorld from './entities/game-world';
import entityList from './entities/entity-list';

type GameEntity = BaseEntity<Components>;

// Blocks are held directly rather than walked through `entity.components.*` per frame: at thousands of
// entities those call sites are megamorphic and don't inline (~940ns vs ~140ns).
type EntitySprite = Phaser.GameObjects.Image & {
	shieldImage: Phaser.GameObjects.Image
	transformBlock: Float32Array
	// Null for an entity that never interpolates (a station).
	interpolationBlock: Float32Array | null
	healthBlock: Float32Array | null
};

interface Explosion {
	sprite: Phaser.GameObjects.Image
	age: number
	fullScale: number
}

const EXPLOSION_DURATION = 150;

export interface StationShipStat {
	eid: number
	color: number
	displayColor: string
	ships: number
}

export interface GameStats {
	fps: number
	timing: PerformanceStats
	memory: string
	stationsCount: number
	shipsCount: number
	totalCount: number
	stationShips: Array<StationShipStat>
}

export type GameState = 'playing' | 'won' | 'lost';

export type NoticeTone = 'good' | 'bad';

export interface LevelNotice {
	message: string
	tone: NoticeTone
}

export interface GameSceneOptions {
	world: GameWorld
	level: LevelConfig
	carry: Carry
	// Off for the stress test so a scratch battle can't advance or wipe a real run.
	persistProgress?: boolean
}

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

// The play scene: runs the world each frame, syncs a sprite (+ shield) per entity, and owns the meta-game
// (player faction, money, upgrades, win/lose). The HUD is the parallel UIScene reading this scene's getters.
export default class GameScene extends Phaser.Scene {
	private world: GameWorld;
	private level: LevelConfig;
	private carry: Carry;
	private persistProgress: boolean;

	private latestStats: GameStats = EMPTY_GAME_STATS;

	private timing: PerformanceTiming<Components>;

	private paused = false;
	private eidSpriteMap = new Map<number, EntitySprite>();
	// Dead sprites, hidden and kept for reuse rather than destroyed.
	private spritePool: Array<EntitySprite> = [];

	// Pooled because blasts are bursty (a wave of Detonators can go off together).
	private explosions: Array<Explosion> = [];
	private explosionPool: Array<Phaser.GameObjects.Image> = [];

	// -1 until the level is loaded. Only this faction's money is spendable.
	private playerStationEid = -1;
	private roster?: ShipRoster;
	private state: GameState = 'playing';

	// While set, addSprite bails so every sprite is re-added in one pass once every station exists (a ship
	// reads its colour from its owning station).
	private loadingLevel = false;

	private pendingNotice: LevelNotice | null = null;

	// A decided match's level swap, deferred to the next update (see queueTransition).
	private pendingTransition: (() => void) | null = null;

	// A loss frees the station before the match is settled, so this holds what the player died with.
	private lastCarry: Carry = emptyCarry();

	private stationShips: Array<StationShipStat> = [];

	constructor(options: GameSceneOptions) {
		super('game');
		this.world = options.world;
		this.level = options.level;
		this.carry = options.carry;
		this.persistProgress = options.persistProgress ?? true;
		this.timing = new PerformanceTiming(this.world);
	}

	preload() {
		// Fallback hull for anything without its own silhouette (a drone, a projectile).
		this.load.image('boid', 'boid.png');
		this.load.image('station', 'station.png');
		this.load.image('shield', 'shield3.png');
		this.load.image('explosion', 'effects/explosion.png');
		for(const type of SHIP_TYPES) {
			this.load.image(type, SHIP_TYPE_DEFS[type].sprite);
		}
	}

	create() {
		this.timing.on('stats-updated', () => this.refreshStats());
		this.events.once('shutdown', () => this.timing.destroy());

		this.world.on('entity-removed', (entity: GameEntity) => {
			let sprite = this.eidSpriteMap.get(entity.eid);
			if(sprite) {
				this.eidSpriteMap.delete(entity.eid);
				this.releaseSprite(sprite);
			}

			// Last point the station can still be read: freed only after this event. Snapshot for a loss.
			if(entity.eid === this.playerStationEid) {
				this.lastCarry = carryFromStation(entity);
			}
		});

		this.world.on('entity-added', (entity: GameEntity) => this.addSprite(entity));

		// Deliberately nothing listens to POSITION_UPDATED_EVENT (fires per 50ms step, would stutter). That also
		// lets PhysicsSystem skip cloning the moved-id array across the worker boundary.

		this.input.keyboard?.on('keydown-SPACE', () => {
			if(this.state === 'playing') {
				this.paused = !this.paused;
			}
		});

		this.loadLevel(this.level, this.carry);

		this.scene.launch('ui');

		this.refreshStats();
	}

	// Swaps the world over to `level` in place: world.load frees old entities and loads new, workers resync from
	// the add/remove deltas. No page reload.
	private loadLevel(level: LevelConfig, carry: Carry) {
		this.level = level;
		this.carry = carry;
		this.paused = false;

		this.clearExplosions();

		// addSprite is suppressed during the swap so it runs in one pass below, once every station exists.
		this.loadingLevel = true;
		this.world.load({ entities: level.entities, bounds: level.bounds });
		this.loadingLevel = false;

		this.setupCamera();
		this.world.entities.forEach(entity => this.addSprite(entity));
		this.setupStationsAndCarry();

		this.state = 'playing';
	}

	// Zooms the game camera so this level's bounds fill the play-area strip. The UIScene has its own
	// full-canvas camera, so the HUD never changes size with the level.
	private setupCamera() {
		const { width, height } = this.scale;
		const viewport = playAreaViewport(width, height);
		const bounds = this.level.bounds;
		const zoom = Math.min(viewport.width / bounds.width, viewport.height / bounds.height);
		this.cameras.main.setViewport(viewport.x, viewport.y, viewport.width, viewport.height);
		this.cameras.main.setZoom(zoom);
		this.cameras.main.centerOn(bounds.width / 2, bounds.height / 2);
	}

	// Finds the player faction and applies carried money/upgrades onto the level's base. Plain writes are safe:
	// no worker touches the block until the first update next frame.
	private setupStationsAndCarry() {
		let stations = entityList(this.world).filter(entity => entity.components.controller);
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

		this.playerStationEid = stations.find(station => station.components.controller!.player)?.eid ?? -1;

		const playerController = this.playerController;
		const playerHangar = this.playerHangar;
		const playerStation = this.world.getEntityByEid(this.playerStationEid);
		if(playerController && playerHangar && playerStation) {
			const hangarBlock = this.world.registry.hangar.memoryComponent.getBlock(playerHangar.index) as Int32Array;
			for(const type of SHIP_TYPES) {
				const ship = this.carry.ships[type];
				if(!ship) {
					continue;
				}
				const idx = SHIP_TYPE_INDEX[type];
				hangarBlock[hangarRateIndex(idx)] += ship.rate;
				hangarBlock[hangarLevelIndex(idx)] += ship.level;
				hangarBlock[hangarRateBoughtIndex(idx)] += ship.rate;
				hangarBlock[hangarLevelBoughtIndex(idx)] += ship.level;
			}
			playerController.money += this.carry.money;

			this.roster = new ShipRoster(this.world, playerStation);
		} else {
			this.roster = undefined;
		}
	}

	update(time: number, delta: number) {
		// A decided match's swap runs here so any in-flight worker run settles on the old world first.
		if(this.pendingTransition) {
			const run = this.pendingTransition;
			this.pendingTransition = null;
			run();
			return;
		}

		if(this.paused || this.state !== 'playing') {
			return;
		}

		// Milliseconds: Phaser's delta as it comes, and what shared-memory-physics expects.
		this.world.update(delta);

		this.syncSprites();

		this.updateExplosions(delta);

		this.checkForGameOver();
	}

	private addSprite(entity: GameEntity) {
		if(this.loadingLevel) {
			return;
		}

		const transform = entity.components.transform;
		if(!transform || this.eidSpriteMap.has(entity.eid)) {
			return;
		}

		const sprite = this.spritePool.pop() ?? this.createSprite();
		this.dressSprite(sprite, entity, transform);
		this.eidSpriteMap.set(entity.eid, sprite);

		// The listener dies with the (never-pooled) entity, so nothing to unsubscribe.
		const type = entity.components.entity.type;
		if(isShipType(type) && SHIP_TYPE_DEFS[type].detonateOnContact) {
			entity.on(DETONATED_EVENT, (x: number, y: number, radius: number) => this.spawnExplosion(x, y, radius));
		}

		this.syncSprite(sprite);
	}

	// Undressed pair; dressSprite attaches the blocks that make this an EntitySprite.
	private createSprite(): EntitySprite {
		const sprite = this.add.image(0, 0, 'boid') as EntitySprite;
		sprite.shieldImage = this.add.image(0, 0, 'shield');

		return sprite;
	}

	// Points a recycled sprite at an entity: everything that can differ from the previous owner is set here.
	private dressSprite(sprite: EntitySprite, entity: GameEntity, transform: NonNullable<GameEntity['components']['transform']>) {
		// Texture set before the scale, which is derived from the texture's own size.
		const type = entity.components.entity.type;
		sprite.setTexture(entity.components.controller ? 'station' : isShipType(type) ? type : 'boid');
		sprite.setScale(transform.width / sprite.width, transform.height / sprite.height);
		// Shield art points up while `width` is front-to-back length, so map width -> shield Y, height -> shield X.
		sprite.shieldImage.setScale(transform.height / sprite.shieldImage.width * 2, transform.width / sprite.shieldImage.height * 2);
		sprite.setTint(this.getTint(entity.eid));

		const registry = this.world.registry;
		sprite.transformBlock = registry.transform.memoryComponent.getBlock(transform.index) as Float32Array;
		const interpolation = entity.components.interpolation;
		sprite.interpolationBlock = interpolation ? registry.interpolation.memoryComponent.getBlock(interpolation.index) as Float32Array : null;
		const health = entity.components.health;
		sprite.healthBlock = health ? registry.health.memoryComponent.getBlock(health.index) as Float32Array : null;

		sprite.visible = true;
		sprite.shieldImage.visible = false;
	}

	// Hidden and pooled, not destroyed: Phaser's display list is a plain array, so destroy is an indexOf +
	// splice across every sprite (~40us and growing).
	private releaseSprite(sprite: EntitySprite) {
		sprite.visible = false;
		sprite.shieldImage.visible = false;
		this.spritePool.push(sprite);
	}

	// Sized so the texture footprint is the blast diameter. updateExplosions animates it.
	private spawnExplosion(x: number, y: number, radius: number) {
		const sprite = this.explosionPool.pop() ?? this.createExplosion();
		sprite.setPosition(x, y);
		// Random spin so a wave of blasts doesn't flash the same star at the same angle.
		sprite.setRotation(Math.random() * Math.PI * 2);
		sprite.setVisible(true);

		this.explosions.push({ sprite, age: 0, fullScale: (radius * 2) / sprite.width });
	}

	// Additive blend so fire reads as light; above the fleet so it is never hidden.
	private createExplosion(): Phaser.GameObjects.Image {
		const sprite = this.add.image(0, 0, 'explosion');
		sprite.setBlendMode(Phaser.BlendModes.ADD);
		sprite.setDepth(1);

		return sprite;
	}

	private updateExplosions(delta: number) {
		for(let i = this.explosions.length - 1; i >= 0; i--) {
			const explosion = this.explosions[i];
			explosion.age += delta;
			const t = explosion.age / EXPLOSION_DURATION;
			if(t >= 1) {
				explosion.sprite.visible = false;
				this.explosionPool.push(explosion.sprite);
				this.explosions[i] = this.explosions[this.explosions.length - 1];
				this.explosions.pop();
				continue;
			}

			// Full spread by ~60% of its life, then holds while it fades.
			const grow = Math.min(1, t / 0.6);
			const eased = 1 - (1 - grow) * (1 - grow) * (1 - grow);
			explosion.sprite.setScale(explosion.fullScale * (0.35 + 0.65 * eased));
			explosion.sprite.alpha = t < 0.4 ? 1 : 1 - (t - 0.4) / 0.6;
		}
	}

	// On level swap so old blasts don't linger over the next level.
	private clearExplosions() {
		for(const explosion of this.explosions) {
			explosion.sprite.visible = false;
			this.explosionPool.push(explosion.sprite);
		}
		this.explosions.length = 0;
	}

	private syncSprite(sprite: EntitySprite) {
		const transform = sprite.transformBlock;
		const shield = sprite.shieldImage;
		const interpolation = sprite.interpolationBlock;

		// Interpolation block, not transform: the transform only jumps when a 50ms step lands. Null for a station.
		if(interpolation) {
			sprite.x = shield.x = interpolation[INTERPOLATION_X_INDEX];
			sprite.y = shield.y = interpolation[INTERPOLATION_Y_INDEX];
		} else {
			sprite.x = shield.x = transform[TRANSFORM_X_INDEX];
			sprite.y = shield.y = transform[TRANSFORM_Y_INDEX];
		}

		// `rotation`, not `angle`: the transform's facing is in radians.
		const angle = transform[TRANSFORM_ANGLE_INDEX];
		sprite.rotation = angle;
		// Shield art's front edge is at the top, so a quarter turn to match the heading.
		shield.rotation = angle + Math.PI / 2;
		const health = sprite.healthBlock;
		shield.visible = health !== null && health[HEALTH_SHIELDS] > 0;
	}

	// Unconditional: one pass over the fleet is cheaper than following physics move events, and also catches
	// shields draining/regenerating and anything standing still.
	private syncSprites() {
		this.eidSpriteMap.forEach(sprite => this.syncSprite(sprite));
	}

	// --- Meta-game state the UIScene renders ------------------------------------------------------------

	get gameState(): GameState {
		return this.state;
	}

	get stats(): GameStats {
		return this.latestStats;
	}

	get levelTitle(): string {
		return this.level.title;
	}

	// A level outside the play order (the stress test) has no number.
	get levelLabel(): string {
		const index = getLevelIndex(this.level.name);
		return index >= 0 ? `Level ${index + 1}: ${this.level.title}` : this.level.title;
	}

	get playerMoney(): number {
		return this.playerController?.money ?? 0;
	}

	get playerColor(): number {
		return this.playerController?.color ?? 0xffffff;
	}

	get playerShips(): number {
		let ships = 0;
		this.world.entities.forEach(entity => {
			// A projectile is `controlled` too, so exclude it.
			if(entity.components.controlled?.owner === this.playerStationEid && !entity.components.projectile) {
				ships++;
			}
		});

		return ships;
	}

	get playerShipsPerSecond(): number {
		if(!this.roster) {
			return 0;
		}
		return SHIP_TYPES.reduce((total, type) => total + this.roster!.rate(type), 0);
	}

	get shipRoster(): ShipRoster | undefined {
		return this.roster;
	}

	// --- Automatic level progression --------------------------------------------------------------------

	takeNotice(): LevelNotice | null {
		const notice = this.pendingNotice;
		this.pendingNotice = null;
		return notice;
	}

	// Jumps to where the decided match sends the player, in place, no dialog (see progressAfterMatch).
	// persistProgress off just replays from a clean carry, touching neither saved progress nor a notice.
	private advanceAfterMatch(outcome: 'won' | 'lost'): void {
		if(!this.persistProgress) {
			const level = this.level;
			this.queueTransition(() => this.loadLevel(level, emptyCarry()));
			return;
		}

		const levelIndex = getLevelIndex(this.level.name);
		const nextLevelIndex = this.level.nextLevel ? getLevelIndex(this.level.nextLevel) : -1;
		const next = progressAfterMatch(outcome, levelIndex, nextLevelIndex, this.currentCarry());
		if(next === 'reset') {
			resetProgress();
			this.queueTransition(() => {
				this.pendingNotice = { message: 'You cleared every level! Starting a fresh run.', tone: 'good' };
				this.loadLevel(firstLevel, emptyCarry());
			});
		} else {
			saveProgress(next);
			const nextLevel = levels[next.levelIndex];
			const notice = this.matchNotice(outcome, levelIndex, next.levelIndex);
			this.queueTransition(() => {
				this.pendingNotice = notice;
				this.loadLevel(nextLevel, next.carry);
			});
		}
	}

	// Levels are numbered 1-based to match the HUD's "Level N" heading.
	private matchNotice(outcome: 'won' | 'lost', fromIndex: number, toIndex: number): LevelNotice {
		if(outcome === 'won') {
			return { message: `Victory! Advancing to level ${toIndex + 1}.`, tone: 'good' };
		}
		if(toIndex < fromIndex) {
			return { message: `Your station was destroyed - falling back to level ${toIndex + 1}.`, tone: 'bad' };
		}
		return { message: 'Your station was destroyed - regrouping on level 1.', tone: 'bad' };
	}

	private queueTransition(run: () => void): void {
		this.pendingTransition = run;
	}

	// Live off the station on a win, else the snapshot taken when it was destroyed on a loss.
	private currentCarry(): Carry {
		const station = this.world.getEntityByEid(this.playerStationEid);
		return station ? carryFromStation(station) : this.lastCarry;
	}

	private get playerController() {
		return this.world.getEntityByEid(this.playerStationEid)?.components.controller;
	}

	private get playerHangar() {
		return this.world.getEntityByEid(this.playerStationEid)?.components.hangar;
	}

	private checkForGameOver() {
		let playerAlive = false;
		let enemiesAlive = false;
		this.world.entities.forEach(entity => {
			if(!entity.components.controller) {
				return;
			}

			if(entity.eid === this.playerStationEid) {
				playerAlive = true;
			} else {
				enemiesAlive = true;
			}
		});

		if(!playerAlive) {
			this.endMatch('lost');
		} else if(!enemiesAlive) {
			this.endMatch('won');
		}
	}

	// Flipping the state freezes the simulation on the deciding frame; update() then early-returns.
	private endMatch(outcome: 'won' | 'lost'): void {
		this.state = outcome;
		this.advanceAfterMatch(outcome);
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
		const entities = entityList(this.world);
		let stations = entities.filter(entity => !!entity.components.controller);
		// Projectiles are `controlled` too; the tally is ships only.
		let ships = entities.filter(entity => !!entity.components.controlled && !entity.components.projectile);

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
			timing: this.timing.stats,
			memory: prettyMemory(this.world.heap),
			stationsCount: stations.length,
			shipsCount: ships.length,
			totalCount: this.world.entities.size,
			// Copy so the consumer can't mutate the scene's array.
			stationShips: this.stationShips.map(stat => ({ ...stat })),
		};
	}
}
