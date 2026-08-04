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
import { getLevelIndex } from '@/data/levels';
import type { Carry } from '@/data/progress';
import { saveProgress, resetProgress } from '@/data/progress';
import type { Components } from './components';
import {
	hangarRateIndex,
	hangarLevelIndex,
	hangarRateBoughtIndex,
	hangarLevelBoughtIndex,
} from './components/hangar';
import { HEALTH_SHIELDS } from './components/health';
import { SHIP_TYPES, SHIP_TYPE_INDEX, SHIP_TYPE_DEFS, isShipType } from '@/data/ship-types';
import ShipRoster from './ship-roster';
import { playAreaViewport } from './display';
import type GameWorld from './entities/game-world';
import entityList from './entities/entity-list';

// A live entity as this scene sees it: the world's entity type narrowed to this game's component map.
type GameEntity = BaseEntity<Components>;

// The pair of images one entity is drawn with: its hull, and the shield bubble that rides on top of it.  The
// shield hangs off the hull rather than living in a second map so a sync only costs one lookup.
//
// The two shared-memory blocks it is drawn from hang off it as well, resolved once when the sprite is set up.
// Everything here could be reached through `entity.components.transform.x` instead, but that walks five
// objects and ends in a getter closure, and with thousands of entities alive those call sites are megamorphic
// so none of it inlines: measured at ~940ns an entity against ~140ns for the same values read off the blocks.
// A sprite is synced for every ship that moved on every physics run, which is the one place in this game where
// that difference is worth caring about.
//
// Holding the blocks means holding the assumption that an entity's transform and health are loaded when it is
// created and never swapped out - true here, and the sprite is thrown away with the entity either way.
type EntitySprite = Phaser.GameObjects.Image & {
	shieldImage: Phaser.GameObjects.Image
	// Float32Array: read through TRANSFORM_*_INDEX.
	transformBlock: Float32Array
	// Where to *draw* it, read through INTERPOLATION_*_INDEX: the transform only changes when a physics step
	// lands, so a sprite following it directly would move on one frame in three.  Null for an entity the game
	// never asked to interpolate - a station, which never moves - where the transform is the answer already.
	interpolationBlock: Float32Array | null
	// Float32Array or null for something with no health at all: read through HEALTH_SHIELDS.
	healthBlock: Float32Array | null
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
	// Hull + shield pairs whose entity has died, hidden and kept for the next ship rather than destroyed.
	private spritePool: Array<EntitySprite> = [];

	// The station eid the human plays; -1 until the level is loaded.  Only this faction's money is spendable.
	private playerStationEid = -1;
	// The player's per-type upgrade economy, built once the player station is found in create().  The UI reads its
	// costs/affordability and calls its unlock / buyRate / buyLevel through this scene's `shipRoster` getter.
	private roster?: ShipRoster;
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
		// boid stays the fallback hull for anything without its own silhouette (a Carrier drone, a projectile).
		this.load.image('boid', 'boid.png');
		this.load.image('station', 'station.png');
		this.load.image('shield', 'shield3.png');
		// One white top-down silhouette per ship type, keyed by the type so dressSprite can select it straight off
		// the entity's `type` (see plans/05-assets.md).  Still tinted per faction like boid was.
		for(const type of SHIP_TYPES) {
			this.load.image(type, SHIP_TYPE_DEFS[type].sprite);
		}
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

		// PerformanceTiming closes a reporting window roughly once a second; ride it for the panel so the whole
		// snapshot is from the same moment.  There is no sprite catch-up hanging off it any more: syncSprites
		// covers every sprite every frame, so there is nothing left for a periodic sweep to find.
		this.timing.on('stats-updated', () => this.refreshStats());
		this.events.once('shutdown', () => this.timing.destroy());

		// Take a sprite out of play as soon as its entity is removed (killEntityWorker -> world removes it), and
		// keep it for the next ship to be launched rather than destroying it - see releaseSprite.
		this.world.on('entity-removed', (entity: { eid: number }) => {
			let sprite = this.eidSpriteMap.get(entity.eid);
			if(sprite) {
				this.eidSpriteMap.delete(entity.eid);
				this.releaseSprite(sprite);
			}
		});

		// Give every entity in the level its sprite up front, and every entity spawned later one as it arrives, so
		// nothing has to check for a missing sprite on the hot path.  Done after `load` rather than through
		// `entity-added` for the level's own entities because a ship takes its colour from the station that owns
		// it, which is only guaranteed to exist once the whole scene is in.
		this.world.entities.forEach(entity => this.addSprite(entity));
		this.world.on('entity-added', (entity: GameEntity) => this.addSprite(entity));

		// Nothing listens to POSITION_UPDATED_EVENT.  Sprites are synced from `update` every frame instead, because
		// that event fires once per 50ms physics step and a sprite following it would move three times a second's
		// worth in one go - which is the choppiness the interpolation component exists to hide.  Leaving it
		// unlistened is not just a no-op either: PhysicsSystem checks per run whether anything is listening and,
		// when nothing is, the worker stops pushing an id per moved ship into the run's event array and stops
		// cloning that array back across the boundary.
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

		// The player faction is the (single) controller flagged `player` in the level.
		this.playerStationEid = stations.find(station => station.components.controller!.player)?.eid ?? -1;

		// Apply carried-over progress on top of this level's bases for the player, and build the roster the UI drives.
		// Nothing has simulated yet, so plain writes here are safe (no worker is touching the block until the first
		// update next frame).  Each type's carried bought counts add onto both its rate/level and the matching bought
		// counters, so the type ends up exactly where the player left it - the level config seeds a base, the carry
		// rebuilds their purchases on top, and a type only the player unlocked (absent from the config) is rebuilt
		// whole from its bought counts (see progress.ts / hangar.ts).
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
		// measures elapsedTime in.
		this.world.update(delta);

		// Every sprite, every frame, straight off the shared blocks the workers and the interpolation system have
		// already written.  One pass over the fleet a frame is the whole cost of drawing it: there is no event to
		// wait for, no id list to walk and no map lookup, because nothing here needs to know *which* ships moved -
		// at these counts, nearly all of them did.
		this.syncSprites();

		this.checkForGameOver();
	}

	// Builds the hull + shield pair an entity is drawn with and puts it where the entity currently stands.
	// Anything without a transform - there is nowhere to draw it - is skipped.  Nothing is subscribed here: the
	// moves arrive on the physics system for the whole run at once (see syncMovedSprites), so a sprite costs no
	// listener of its own.
	private addSprite(entity: GameEntity) {
		const transform = entity.components.transform;
		if(!transform || this.eidSpriteMap.has(entity.eid)) {
			return;
		}

		// A pair a dead ship left behind, if there is one - see releaseSprite.  Ships die and launch at roughly
		// the same rate, so in a running battle almost every new one is dressed up out of the pool.
		const sprite = this.spritePool.pop() ?? this.createSprite();
		this.dressSprite(sprite, entity, transform);
		this.eidSpriteMap.set(entity.eid, sprite);

		// Nothing has moved yet, so place it where it starts.
		this.syncSprite(sprite);
	}

	// A fresh, undressed hull + shield pair.  `shieldImage` and the blocks are attached by dressSprite, which is
	// what makes this an EntitySprite rather than a bare Image; Phaser's factory can only hand back the latter.
	private createSprite(): EntitySprite {
		const sprite = this.add.image(0, 0, 'boid') as EntitySprite;
		sprite.shieldImage = this.add.image(0, 0, 'shield');

		return sprite;
	}

	// Points an (possibly recycled) sprite at an entity: its artwork, size, colour, and the shared-memory blocks
	// it will be drawn from.  Everything an entity can differ from the last owner of this sprite in is set here,
	// so a pooled pair is indistinguishable from a new one.
	private dressSprite(sprite: EntitySprite, entity: GameEntity, transform: NonNullable<GameEntity['components']['transform']>) {
		// Before the scale below, which is worked out from the texture's own size.  A station gets the station
		// texture; a ship gets its type's silhouette (loaded under the type's key in preload); anything else - a
		// Carrier drone, a projectile - falls back to the plain boid hull.  Each ship texture's pixel aspect matches
		// its type's width:height, so the scale below stays uniform and the silhouette is not stretched.
		const type = entity.components.entity.type;
		sprite.setTexture(entity.components.controller ? 'station' : isShipType(type) ? type : 'boid');
		sprite.setScale(transform.width / sprite.width, transform.height / sprite.height);
		// The shield art points up (front-to-back runs along its Y axis) whereas the entity's `width` is its
		// front-to-back length, so map width -> shield Y and height -> shield X to keep it skinny like the ship.
		sprite.shieldImage.setScale(transform.height / sprite.shieldImage.width * 2, transform.width / sprite.shieldImage.height * 2);
		sprite.setTint(this.getTint(entity.eid));

		const registry = this.world.registry;
		sprite.transformBlock = registry.transform.memoryComponent.getBlock(transform.index) as Float32Array;
		const interpolation = entity.components.interpolation;
		sprite.interpolationBlock = interpolation ? registry.interpolation.memoryComponent.getBlock(interpolation.index) as Float32Array : null;
		const health = entity.components.health;
		sprite.healthBlock = health ? registry.health.memoryComponent.getBlock(health.index) as Float32Array : null;

		sprite.visible = true;
		// syncSprite decides whether the shield itself shows, off the block just resolved.
		sprite.shieldImage.visible = false;
	}

	// Takes a dead entity's sprite out of play and keeps it for the next ship to be launched, rather than
	// destroying it.  Phaser's display list is a plain array and removing from it is an indexOf + splice across
	// every sprite on screen, so at a few thousand ships a destroy cost ~40us and grew with the fleet - which,
	// at dozens of deaths a physics run, was the second largest thing on this thread.  Hiding costs nothing and
	// leaves the pair where the renderer can skip it.
	//
	// The pool only ever holds sprites the game has already had on screen at once, so it is bounded by the peak
	// entity count rather than growing without limit.
	private releaseSprite(sprite: EntitySprite) {
		sprite.visible = false;
		sprite.shieldImage.visible = false;
		this.spritePool.push(sprite);
	}

	// Puts one entity's sprite where its entity is.  Everything it draws with - position, facing, whether the
	// shield is up - is read straight out of the shared-memory blocks resolved when the sprite was dressed,
	// which already hold whatever the workers wrote, so nothing has to be handed to it and nothing is looked up
	// on the way.
	private syncSprite(sprite: EntitySprite) {
		const transform = sprite.transformBlock;
		const shield = sprite.shieldImage;
		const interpolation = sprite.interpolationBlock;

		// x/y are the centre of the entity, which is where Phaser draws an image from by default.  They come out
		// of the interpolation block rather than the transform: the transform only changes when a 50ms physics
		// step lands, while the render position is rewritten every frame between the two positions that step ran
		// between.  Null for a station, which nothing ever moves, so where it is and where to draw it are the
		// same place.
		if(interpolation) {
			sprite.x = shield.x = interpolation[INTERPOLATION_X_INDEX];
			sprite.y = shield.y = interpolation[INTERPOLATION_Y_INDEX];
		} else {
			sprite.x = shield.x = transform[TRANSFORM_X_INDEX];
			sprite.y = shield.y = transform[TRANSFORM_Y_INDEX];
		}

		// `rotation`, not `angle`: the transform's facing is in radians (0 pointing right, as Phaser has it).
		const angle = transform[TRANSFORM_ANGLE_INDEX];
		sprite.rotation = angle;
		// The shield art has its front edge at the top rather than the right, so turn it a quarter turn further
		// to line its front up with the heading.
		shield.rotation = angle + Math.PI / 2;
		const health = sprite.healthBlock;
		shield.visible = health !== null && health[HEALTH_SHIELDS] > 0;
	}

	// Every sprite, once per rendered frame.  This is the hot path of the frame at a few thousand ships, and it
	// is deliberately unconditional: it costs one pass over the fleet, where following the physics system's move
	// events cost a pass over an id list plus a map lookup per id *and* still only moved things twenty times a
	// second.  Facing and shields ride along because they are two reads on blocks this is already holding.
	//
	// It also picks up what no move event ever could - shields draining and regenerating in shared memory, and
	// anything standing still - so there is no periodic catch-up sweep either.
	private syncSprites() {
		this.eidSpriteMap.forEach(sprite => this.syncSprite(sprite));
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

	// The player faction's colour, used to tint the roster UI's ship icons the same way their ships are tinted.
	get playerColor(): number {
		return this.playerController?.color ?? 0xffffff;
	}

	// How many of the player's ships are flying right now.  There is no cap on the fleet, so this is only ever a
	// snapshot of spawns minus deaths.
	get playerShips(): number {
		// Counted rather than filtered: the HUD reads this every frame, and at a few thousand ships an array of
		// them thrown away immediately is not worth building.
		let ships = 0;
		this.world.entities.forEach(entity => {
			// A projectile is `controlled` too, so exclude it - the fleet count is ships, not the shots they fire.
			if(entity.components.controlled?.owner === this.playerStationEid && !entity.components.projectile) {
				ships++;
			}
		});

		return ships;
	}

	// The player's total launch rate across every type it builds, for the HUD's fleet summary.
	get playerShipsPerSecond(): number {
		if(!this.roster) {
			return 0;
		}
		return SHIP_TYPES.reduce((total, type) => total + this.roster!.rate(type), 0);
	}

	// The per-type upgrade economy the roster UI reads and buys through.  Undefined only before the level has
	// loaded a player station (the stress test has one, so in practice it is always set by the time the UI runs).
	get shipRoster(): ShipRoster | undefined {
		return this.roster;
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

	// The player's progress to carry into the next level: their money and, per type, how many rate / level upgrades
	// they have bought (the hangar's bought counters, which reconstruct the whole line when re-applied - see
	// create()).  Only types with something bought are stored, so the carry stays small and a locked type is simply
	// absent.
	private currentCarry(): Carry {
		const hangar = this.playerHangar;
		const carry: Carry = { money: this.playerController?.money ?? 0, ships: {} };
		if(hangar) {
			for(const type of SHIP_TYPES) {
				const idx = SHIP_TYPE_INDEX[type];
				const rate = hangar.rateBought(idx);
				const level = hangar.levelBought(idx);
				if(rate > 0 || level > 0) {
					carry.ships[type] = { rate, level };
				}
			}
		}
		return carry;
	}

	private get playerController() {
		return this.world.getEntityByEid(this.playerStationEid)?.components.controller;
	}

	// The player station's production lines - where its Skiff rate + level live (see hangar component).
	private get playerHangar() {
		return this.world.getEntityByEid(this.playerStationEid)?.components.hangar;
	}

	// Runs every frame, so it answers both questions in the one pass over the world and builds no list of
	// stations to throw away straight after.
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
			this.state = 'lost';
		} else if(!enemiesAlive) {
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

	private refreshStats() {
		const entities = entityList(this.world);
		let stations = entities.filter(entity => !!entity.components.controller);
		// Projectiles are `controlled` as well; the fleet tally is ships only, so leave the shots out.
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
			// Replaced wholesale each window, so it is safe to hand straight out.
			timing: this.timing.stats,
			memory: prettyMemory(this.world.heap),
			stationsCount: stations.length,
			shipsCount: ships.length,
			totalCount: this.world.entities.size,
			// Copy so the consumer can't mutate the scene's internal array.
			stationShips: this.stationShips.map(stat => ({ ...stat })),
		};
	}
}
