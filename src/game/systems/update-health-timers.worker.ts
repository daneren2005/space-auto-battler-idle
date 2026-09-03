import { createEntitySystemWorker } from '@daneren2005/shared-memory-ecs/worker';
import { updateHealthTimersUpdate } from './update-health-timers-update';

createEntitySystemWorker(self, updateHealthTimersUpdate);
