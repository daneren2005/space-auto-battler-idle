import type { Config } from '@/game/components';
import type { Bounds } from '@/game/systems/game-component-system';

// A hand-authored level.  Each level lives in its own file (level-1.ts, ...) so they can be tracked and
// balanced individually, and is loaded into the world as a Scene (`{ entities, bounds }`).  `entities` are
// full entity configs with explicit positions; a station entity additionally carries `color`, `player` and
// its starting `openShips`.  `nextLevel` names the level to advance to on a win, if any.
export interface LevelConfig {
	name: string
	title: string
	bounds: Bounds
	entities: Array<Config>
	nextLevel?: string
}
