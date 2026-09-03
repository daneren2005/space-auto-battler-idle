import { createEntitySystemWorker } from '@daneren2005/shared-memory-ecs/worker';
import { physicsUpdate } from './physics-update';

// The worker movement + collision detection runs on.  The collision callback reaches this thread by riding
// along with the import - a function cannot be sent through postMessage - which is why physics-update.ts is
// imported by both this file and the system that starts it.
createEntitySystemWorker(self, physicsUpdate);
