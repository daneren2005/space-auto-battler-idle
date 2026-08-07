import { BaseWorld, EntityFactory } from '@daneren2005/shared-memory-ecs';
import { registry } from '../components';
import type { Components, Config } from '../components';
import type { Bounds } from '../systems/game-component-system';
import { entityConfigs } from '@/data/entities';

import { createPhysicsSystem, type GamePhysicsSystem } from '../systems/physics-system';
import { createInterpolationSystem } from '../systems/interpolation-system';
import { createUpdateHealthTimersSystem } from '../systems/update-health-timers-system';
import { createSpawnShipSystem } from '../systems/spawn-ship-system';
import { createTargetEnemySystem } from '../systems/target-enemy-system';
import { createMoveToTargetSystem } from '../systems/move-to-target-system';
import { createWeaponSystem } from '../systems/weapon-system';
import { createUpdateProjectilesSystem } from '../systems/update-projectiles-system';

// The scene format produced by generate-scene: a flat list of entity configs plus the play-area size.
export interface Scene {
	entities: Array<Config>
	bounds: Bounds
}

// Supplies the component registry + per-type templates to BaseWorld and wires up the systems. All the heavy
// lifting (memory, load/save, on/off-thread runs) is the library's; this class only declares what THIS game is.
// `update` is driven in milliseconds (what shared-memory-physics expects).
export default class GameWorld extends BaseWorld<typeof registry> {
	bounds: Bounds = { width: 0, height: 0 };

	// Held by name because the scene draws off it: physics reports each run's movement on the system, not the
	// entities. Lives for the world's lifetime, so safe to hand out.
	physicsSystem: GamePhysicsSystem;

	constructor() {
		super(registry, {
			factory: new EntityFactory<Components, Config>(entityConfigs),
		});
		// Systems live for the world's lifetime; load only clears their entity lists, then re-populates them by
		// re-emitting entity-added, so setting them up once here is enough.
		this.physicsSystem = this.initSystems();
	}

	load(scene: Scene) {
		this.bounds = scene.bounds;
		super.load({ entities: scene.entities });
		// Kicks off worker init; runs work regardless of whether this has resolved yet.
		void this.init();
	}

	private initSystems(): GamePhysicsSystem {
		this.addSystem(createUpdateHealthTimersSystem(this));
		this.addSystem(createSpawnShipSystem(this));
		// Physics runs after spawns, so a ship exists for a frame before anything can run into it. Interpolation
		// follows immediately so a step is drawn on the frame it landed on.
		const physicsSystem = this.addSystem(createPhysicsSystem(this));
		this.addSystem(createInterpolationSystem(this));
		this.addSystem(createTargetEnemySystem(this));
		// Weapons fire after targeting and before movement, so a ship shoots at whoever it's about to steer toward.
		// Projectile upkeep runs last, once this frame's shots exist and everything has its final position.
		this.addSystem(createWeaponSystem(this));
		this.addSystem(createMoveToTargetSystem(this));
		this.addSystem(createUpdateProjectilesSystem(this));

		return physicsSystem;
	}
}
