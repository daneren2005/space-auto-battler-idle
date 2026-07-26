import { BaseWorld, EntityFactory } from '@daneren2005/shared-memory-ecs';
import { registry } from '../components';
import type { Components, Config } from '../components';
import type { Bounds } from '../systems/game-component-system';
import { entityConfigs } from '@/data/entities';

import { createVelocitySystem } from '../systems/velocity-system';
import { createUpdateHealthTimersSystem } from '../systems/update-health-timers-system';
import { createSpawnShipSystem } from '../systems/spawn-ship-system';
import { createCollisionSystem } from '../systems/collision-system';
import { createTargetEnemySystem } from '../systems/target-enemy-system';
import { createMoveToTargetSystem } from '../systems/move-to-target-system';

// The scene format produced by generate-scene: a flat list of entity configs plus the play-area size.
export interface Scene {
	entities: Array<Config>
	bounds: Bounds
}

// The game's world.  It supplies the component registry + the per-type templates (a station's / ship's shared
// static config, from data/entities) to the library's BaseWorld, and wires up the six systems that actually
// play the game.  All of the heavy lifting - memory allocation, load/save, running systems on / off the main
// thread - comes from the library; this class only declares what THIS game is made of.
export default class GameWorld extends BaseWorld<typeof registry> {
	bounds: Bounds = { width: 0, height: 0 };

	constructor() {
		super(registry, {
			factory: new EntityFactory<Components, Config>(entityConfigs),
		});
		// Systems live for the world's lifetime.  They subscribe to entity-added/-removed and BaseWorld#load only
		// clears each system's entity list (not the systems themselves), so setting them up here is enough - load
		// re-populates them by re-emitting entity-added for every entity in the scene.
		this.initSystems();
	}

	load(scene: Scene) {
		this.bounds = scene.bounds;
		super.load({ entities: scene.entities });
		// Kicks off worker initialization; runs work regardless of whether this has resolved yet.
		void this.init();
	}

	private initSystems() {
		this.addSystem(createVelocitySystem(this));
		this.addSystem(createUpdateHealthTimersSystem(this));
		this.addSystem(createSpawnShipSystem(this));
		this.addSystem(createCollisionSystem(this));
		this.addSystem(createTargetEnemySystem(this));
		this.addSystem(createMoveToTargetSystem(this));
	}
}
