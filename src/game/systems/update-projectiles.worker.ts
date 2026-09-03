import { createEntitySystemWorker } from '@daneren2005/shared-memory-ecs/worker';
import { updateProjectilesUpdate } from './update-projectiles-update';

createEntitySystemWorker(self, updateProjectilesUpdate);
