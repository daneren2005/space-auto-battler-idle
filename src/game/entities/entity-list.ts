import type { BaseEntity } from '@daneren2005/shared-memory-ecs';
import type { Components } from '../components';
import type GameWorld from './game-world';

// The world keeps its entities in a Map keyed by eid - which is what makes a death cost a constant-time delete
// rather than a scan of the whole world - so anything that wants to `filter`, `sort` or index them asks for a
// list first.
//
// It copies every entity into a fresh array, so it belongs on the paths that run about once a second (a stats
// refresh, a scene being set up) rather than in a frame.  Something running per frame should count or iterate
// `world.entities` directly instead.
export default function entityList(world: GameWorld): Array<BaseEntity<Components>> {
	return Array.from(world.entities.values());
}
