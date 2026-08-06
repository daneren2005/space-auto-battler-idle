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

// One live explosion: the sprite being animated, how far through its life it is, and the scale it reaches at
// full spread - `fullScale` sizes the texture so its footprint is the detonator's blast diameter, so at its peak
// the shock ring baked into the art sits on the AoE the blast actually dealt.
interface Explosion {
	sprite: Phaser.GameObjects.Image
	// Milliseconds since it went off; it is retired once this passes EXPLOSION_DURATION.
	age: number
	fullScale: number
}

// How long an explosion takes to expand and fade, in milliseconds.  Short - it is a hit-flash over the blast, not
// a lingering effect.
const EXPLOSION_DURATION = 150;

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

// Whether a level-change banner reads as a win (green) or a setback (red); the UIScene's toast tints itself off it.
export type NoticeTone = 'good' | 'bad';

// The one-line banner handed to the UIScene when the game jumps levels on its own - what happened, and how it
// should read.  Delivered in-memory (see takeNotice) now that levels change in place rather than by page reload.
export interface LevelNotice {
	message: string
	tone: NoticeTone
}

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

	// Detonator blasts currently playing, advanced each frame by updateExplosions, plus the spent sprites kept for
	// the next blast.  Pooled like the ship sprites: explosions are bursty (a wave of kamikaze Detonators can go
	// off together), so reusing the sprite avoids churning the display list at the worst moment to do it.
	private explosions: Array<Explosion> = [];
	private explosionPool: Array<Phaser.GameObjects.Image> = [];

	// The station eid the human plays; -1 until the level is loaded.  Only this faction's money is spendable.
	private playerStationEid = -1;
	// The player's per-type upgrade economy, built once the player station is found in create().  The UI reads its
	// costs/affordability and calls its unlock / buyRate / buyLevel through this scene's `shipRoster` getter.
	private roster?: ShipRoster;
	private state: GameState = 'playing';

	// True only while loadLevel is swapping the world's contents.  addSprite bails out during that window so it can
	// re-add every sprite in one pass once the whole level is in - a ship takes its colour from its owning station,
	// which the batch load may create after it (see loadLevel / addSprite).
	private loadingLevel = false;

	// A level-change banner waiting to be picked up by the UIScene's toast (see takeNotice).  Set as the game jumps
	// levels on its own; cleared the frame the UI shows it.
	private pendingNotice: LevelNotice | null = null;

	// A decided match's level swap, deferred to the start of the next update (see queueTransition).  Null except in
	// the one-frame gap between a match being settled and the world being reloaded into the new level.
	private pendingTransition: (() => void) | null = null;

	// The last carry read off the player station, captured the moment it is removed.  A loss destroys the station
	// before the match is settled, so by then it can no longer be read for its money / upgrades - this holds what the
	// player died with so a defeat carries that rather than zeros (see the entity-removed handler in create()).
	private lastCarry: Carry = emptyCarry();

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
		// The one-shot blast played over a Detonator's AoE when it goes off (see spawnExplosion / plans/05-assets.md).
		this.load.image('explosion', 'effects/explosion.png');
		// One white top-down silhouette per ship type, keyed by the type so dressSprite can select it straight off
		// the entity's `type` (see plans/05-assets.md).  Still tinted per faction like boid was.
		for(const type of SHIP_TYPES) {
			this.load.image(type, SHIP_TYPE_DEFS[type].sprite);
		}
	}

	create() {
		// The listeners below live for the scene's lifetime and drive every level equally, so they are wired once
		// here.  The per-level work - loading the world, sizing the camera, applying the carry - is loadLevel, which
		// runs now for the first level and again in place each time the game jumps to another (no page reload).

		// PerformanceTiming closes a reporting window roughly once a second; ride it for the panel so the whole
		// snapshot is from the same moment.  There is no sprite catch-up hanging off it any more: syncSprites
		// covers every sprite every frame, so there is nothing left for a periodic sweep to find.
		this.timing.on('stats-updated', () => this.refreshStats());
		this.events.once('shutdown', () => this.timing.destroy());

		// Take a sprite out of play as soon as its entity is removed (killEntityWorker -> world removes it, and a
		// level change removes every entity at once), and keep it for the next ship rather than destroying it - see
		// releaseSprite.
		this.world.on('entity-removed', (entity: GameEntity) => {
			let sprite = this.eidSpriteMap.get(entity.eid);
			if(sprite) {
				this.eidSpriteMap.delete(entity.eid);
				this.releaseSprite(sprite);
			}

			// The player station being destroyed is the loss, and its memory is freed just after this event.  The
			// world removes it from its map before emitting this but frees its component memory only after, so this
			// is the last point the station can still be read - snapshot the carry here so a defeat carries what the
			// player died holding rather than the zeros a since-freed station would report.
			if(entity.eid === this.playerStationEid) {
				this.lastCarry = carryFromStation(entity);
			}
		});

		// Give every entity spawned during play its sprite as it arrives.  The level's own entities are handled by
		// loadLevel instead (addSprite bails while loadingLevel is set), because a ship takes its colour from the
		// station that owns it, which is only guaranteed to exist once the whole scene is in.
		this.world.on('entity-added', (entity: GameEntity) => this.addSprite(entity));

		// Nothing listens to POSITION_UPDATED_EVENT.  Sprites are synced from `update` every frame instead, because
		// that event fires once per 50ms physics step and a sprite following it would move three times a second's
		// worth in one go - which is the choppiness the interpolation component exists to hide.  Leaving it
		// unlistened is not just a no-op either: PhysicsSystem checks per run whether anything is listening and,
		// when nothing is, the worker stops pushing an id per moved ship into the run's event array and stops
		// cloning that array back across the boundary.

		this.input.keyboard?.on('keydown-SPACE', () => {
			if(this.state === 'playing') {
				this.paused = !this.paused;
			}
		});

		this.loadLevel(this.level, this.carry);

		// Draw the HUD on top; it reads this scene back via this.scene.get('game').
		this.scene.launch('ui');

		// Push an initial snapshot so the panel is populated before the first reporting window elapses.
		this.refreshStats();
	}

	// Swaps the whole world over to `level` and applies `carry` on top of its player station, sizing the camera to
	// the new bounds.  Runs both for the first level (from create) and for every automatic jump afterwards - the
	// same world, systems and workers are reused across the swap: world.load frees the old entities and loads the
	// new, and the workers resync from the add/remove deltas that load emits (see BaseWorld.load).  No page reload,
	// so the running Phaser game, its scenes and the worker threads all survive the level change.
	private loadLevel(level: LevelConfig, carry: Carry) {
		this.level = level;
		this.carry = carry;
		this.paused = false;

		// Any blasts still animating belong to the level being left; drop them so they don't hang over the new one.
		this.clearExplosions();

		// Replace the world's contents.  entity-removed fires for every old entity (pooling its sprite), then
		// entity-added for every new one - addSprite is suppressed for those so it can run in one pass below, once
		// every station exists and a ship can read its owner's colour.
		this.loadingLevel = true;
		this.world.load({ entities: level.entities, bounds: level.bounds });
		this.loadingLevel = false;

		this.setupCamera();
		this.world.entities.forEach(entity => this.addSprite(entity));
		this.setupStationsAndCarry();

		this.state = 'playing';
	}

	// Points the game camera at the play-area strip and zooms so this level's world bounds fill it.  The canvas is a
	// fixed size (DISPLAY_*) and the battle only gets the strip between the HUD's top text and its bottom buttons, so
	// a small level zooms in and a large one zooms out - either way the UIScene, which has its own full-canvas
	// camera, is untouched, so the HUD/menus never change size with the level and no station is drawn under them.
	private setupCamera() {
		const { width, height } = this.scale;
		const viewport = playAreaViewport(width, height);
		const bounds = this.level.bounds;
		const zoom = Math.min(viewport.width / bounds.width, viewport.height / bounds.height);
		this.cameras.main.setViewport(viewport.x, viewport.y, viewport.width, viewport.height);
		this.cameras.main.setZoom(zoom);
		this.cameras.main.centerOn(bounds.width / 2, bounds.height / 2);
	}

	// Rebuilds the per-station debug tally, finds the player faction, and applies the carried money / upgrades on top
	// of this level's player-station base, building the roster the UI drives.  Nothing has simulated yet, so plain
	// writes here are safe (no worker touches the block until the first update next frame).  Each type's carried
	// bought counts add onto both its rate/level and the matching bought counters, so the type ends up exactly where
	// the player left it - the level config seeds a base, the carry rebuilds their purchases on top, and a type only
	// the player unlocked (absent from the config) is rebuilt whole from its bought counts (see progress.ts).
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

		// The player faction is the (single) controller flagged `player` in the level.
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
		// A decided match defers its level swap to here (see queueTransition), so any worker run still in flight from
		// the deciding frame has settled on the old world first.  loadLevel puts the state back to 'playing', so the
		// new level simulates from the next frame on.
		if(this.pendingTransition) {
			const run = this.pendingTransition;
			this.pendingTransition = null;
			run();
			return;
		}

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

		// Advance any detonator blasts playing over the fleet.  Off the same delta the world just stepped, so an
		// explosion keeps pace with the game when it is running (and freezes with it when paused, since this whole
		// method returns early then).
		this.updateExplosions(delta);

		this.checkForGameOver();
	}

	// Builds the hull + shield pair an entity is drawn with and puts it where the entity currently stands.
	// Anything without a transform - there is nowhere to draw it - is skipped.  Nothing is subscribed here: the
	// moves arrive on the physics system for the whole run at once (see syncMovedSprites), so a sprite costs no
	// listener of its own.
	private addSprite(entity: GameEntity) {
		// While a level is loading, the whole batch is drawn in one pass afterwards (see loadLevel) so a ship can read
		// its owning station's colour - the entity-added events firing mid-load are ignored here.
		if(this.loadingLevel) {
			return;
		}

		const transform = entity.components.transform;
		if(!transform || this.eidSpriteMap.has(entity.eid)) {
			return;
		}

		// A pair a dead ship left behind, if there is one - see releaseSprite.  Ships die and launch at roughly
		// the same rate, so in a running battle almost every new one is dressed up out of the pool.
		const sprite = this.spritePool.pop() ?? this.createSprite();
		this.dressSprite(sprite, entity, transform);
		this.eidSpriteMap.set(entity.eid, sprite);

		// A Detonator fires DETONATED_EVENT on itself the moment its blast goes off (from the worker, just before it
		// dies), carrying where it detonated and how far the blast reached - listen for it so we can draw the AoE.
		// Only the handful of types that detonate get a listener, and it dies with the (never-pooled) entity, so
		// there is nothing to unsubscribe.
		const type = entity.components.entity.type;
		if(isShipType(type) && SHIP_TYPE_DEFS[type].detonateOnContact) {
			entity.on(DETONATED_EVENT, (x: number, y: number, radius: number) => this.spawnExplosion(x, y, radius));
		}

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

	// Kicks off an explosion over a blast the worker just resolved: centred where the Detonator went off and sized
	// so the texture's footprint is the blast diameter, so as it spreads the shock ring in the art lands on the
	// edge of the AoE the blast actually dealt.  In world coordinates on the game camera, exactly like the ships,
	// so it zooms with the level and sits over the fleet.  updateExplosions animates it from here.
	private spawnExplosion(x: number, y: number, radius: number) {
		const sprite = this.explosionPool.pop() ?? this.createExplosion();
		sprite.setPosition(x, y);
		// A random spin so a wave of blasts doesn't show the same star flash stamped at the same angle.
		sprite.setRotation(Math.random() * Math.PI * 2);
		sprite.setVisible(true);

		this.explosions.push({ sprite, age: 0, fullScale: (radius * 2) / sprite.width });
	}

	// A fresh explosion sprite, drawn additively so its fire reads as light over the dark play area and overlapping
	// blasts build up, and above the fleet so it is never hidden behind a hull.  Its per-blast position/scale/alpha
	// are set by spawnExplosion + updateExplosions.
	private createExplosion(): Phaser.GameObjects.Image {
		const sprite = this.add.image(0, 0, 'explosion');
		sprite.setBlendMode(Phaser.BlendModes.ADD);
		sprite.setDepth(1);

		return sprite;
	}

	// Every live blast, once per frame.  Each expands with an ease-out (fast punch, then settling into the full AoE)
	// and holds bright before fading out over the back half of its life, so there is a clear moment where it covers
	// the whole blast radius at full strength.  A spent one is hidden and kept for the next blast (swap-and-pop, so
	// the retirement is order-independent and allocation-free).
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

			// Reaches full spread by ~60% of its life (grow clamps to 1 there), then holds it while it fades.
			const grow = Math.min(1, t / 0.6);
			const eased = 1 - (1 - grow) * (1 - grow) * (1 - grow);
			explosion.sprite.setScale(explosion.fullScale * (0.35 + 0.65 * eased));
			// Full strength through the first 40%, then a linear fade to nothing.
			explosion.sprite.alpha = t < 0.4 ? 1 : 1 - (t - 0.4) / 0.6;
		}
	}

	// Retires every live blast at once, hiding each sprite and returning it to the pool.  Called when a level is
	// swapped out so blasts from the finished battle don't linger over the next one.
	private clearExplosions() {
		for(const explosion of this.explosions) {
			explosion.sprite.visible = false;
			this.explosionPool.push(explosion.sprite);
		}
		this.explosions.length = 0;
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

	// --- Automatic level progression --------------------------------------------------------------------

	// The banner the UIScene shows once it has room to; taken (and cleared) by the UI the frame it renders it.
	takeNotice(): LevelNotice | null {
		const notice = this.pendingNotice;
		this.pendingNotice = null;
		return notice;
	}

	// Works out where the decided match sends the player and jumps there - no win/lose dialog.  A win climbs to (and
	// persists) the next level carrying the player's upgrades forward, or wipes the run for a fresh start once the
	// last level is cleared; a loss drops back a level so an idle run keeps banking money on a level it can still
	// clear (see progressAfterMatch).  Both outcomes carry the money / upgrades the player *finished the match with*
	// - a loss via the snapshot taken as the station died - so each jump resumes stronger.  The jump happens in
	// place on the next frame: the world is reloaded (not the page) and the running game and its workers survive.  A
	// level outside the campaign (persistProgress off) just replays from a clean carry, touching neither the saved
	// run nor a notice.
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

	// The one-line banner the destination level shows, describing the jump that just happened.  Levels are numbered
	// 1-based to match the HUD's "Level N" heading.
	private matchNotice(outcome: 'won' | 'lost', fromIndex: number, toIndex: number): LevelNotice {
		if(outcome === 'won') {
			return { message: `Victory! Advancing to level ${toIndex + 1}.`, tone: 'good' };
		}
		if(toIndex < fromIndex) {
			return { message: `Your station was destroyed - falling back to level ${toIndex + 1}.`, tone: 'bad' };
		}
		// Already at the first level: there is nowhere further back to fall, so it just replays.
		return { message: 'Your station was destroyed - regrouping on level 1.', tone: 'bad' };
	}

	// Defer the level swap to the start of the next update rather than running it now.  A worker run dispatched on
	// the frame the match was decided is still in flight; letting it land first means its ships (and deaths) settle
	// on the old world and are cleared by the reload, instead of leaking into the new level.  One frame is
	// imperceptible - there is no deliberate pause.
	private queueTransition(run: () => void): void {
		this.pendingTransition = run;
	}

	// The player's progress to carry forward: their money and, per type, how many rate / level upgrades they have
	// bought (see carryFromStation).  Read live off the player station when it is still alive (a win), and fall
	// back to the snapshot taken the moment it was destroyed (a loss) - so either outcome carries exactly what the
	// player finished the match holding.
	private currentCarry(): Carry {
		const station = this.world.getEntityByEid(this.playerStationEid);
		return station ? carryFromStation(station) : this.lastCarry;
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
			this.endMatch('lost');
		} else if(!enemiesAlive) {
			this.endMatch('won');
		}
	}

	// Called the single frame a match is decided (checkForGameOver only runs while playing, and update() early-
	// returns once state leaves 'playing', so this fires exactly once).  Flipping the state freezes the simulation
	// on the deciding frame; advanceAfterMatch then persists the jump and schedules the swap into the new level.
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
