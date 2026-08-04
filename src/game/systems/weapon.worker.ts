import { createComponentWorker } from '@daneren2005/shared-memory-ecs/worker';
import { weaponUpdate } from './weapon-update';

createComponentWorker(self, weaponUpdate);
