import { createComponentWorker } from '@daneren2005/shared-memory-ecs/worker';
import { updateHealthTimersUpdate } from './update-health-timers-update';

createComponentWorker(self, updateHealthTimersUpdate);
