import type { Config } from '@/game/components';
import type { Bounds } from '@/game/systems/game-component-system';

// A hand-authored level, loaded into the world as a Scene (`{ entities, bounds }`). `entities` are full configs
// with explicit positions; a station also carries `color`, `player` and its `ships` roster. `nextLevel` names
// the level to advance to on a win.
export interface LevelConfig {
	name: string
	title: string
	bounds: Bounds
	entities: Array<Config>
	nextLevel?: string
}
