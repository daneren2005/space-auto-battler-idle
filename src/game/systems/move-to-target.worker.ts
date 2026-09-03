import { createEntitySystemWorker } from '@daneren2005/shared-memory-ecs/worker';
import { moveToTargetUpdate } from './move-to-target-update';

createEntitySystemWorker(self, moveToTargetUpdate);
