import type { BaseEntity } from '@daneren2005/shared-memory-ecs';
import type { Components } from '../components';
import type GameWorld from './game-world';

// The world keeps entities in a Map keyed by eid; this copies them into a fresh array for `filter`/`sort`/index.
// Belongs on ~1Hz paths (stats refresh, scene setup), not a frame - per-frame code should iterate
// `world.entities` directly.
export default function entityList(world: GameWorld): Array<BaseEntity<Components>> {
	return Array.from(world.entities.values());
}
