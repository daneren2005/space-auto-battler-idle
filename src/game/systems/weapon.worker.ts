import { createEntitySystemWorker } from '@daneren2005/shared-memory-ecs/worker';
import { weaponUpdate } from './weapon-update';
import { registry } from '../components';

// The registry is passed so this worker has each component's toBlock() to build projectiles/drones off-thread.
createEntitySystemWorker(self, weaponUpdate, registry);
