import { createComponentWorker } from '@daneren2005/shared-memory-ecs/worker';
import { moveToTargetUpdate } from './move-to-target-update';

createComponentWorker(self, moveToTargetUpdate);
