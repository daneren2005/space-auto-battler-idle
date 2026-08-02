import { createComponentWorker } from '@daneren2005/shared-memory-ecs/worker';
import { spawnShipUpdate } from './spawn-ship-update';

createComponentWorker(self, spawnShipUpdate);
