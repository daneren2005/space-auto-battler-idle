import { createEntitySystemWorker } from '@daneren2005/shared-memory-ecs/worker';
import { spawnShipUpdate } from './spawn-ship-update';
import { registry } from '../components';

// The registry is passed so this worker has each component's toBlock() to build ships off-thread from a config.
createEntitySystemWorker(self, spawnShipUpdate, registry);
