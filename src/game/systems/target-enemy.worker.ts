import { createComponentWorker } from '@daneren2005/shared-memory-ecs/worker';
import { targetEnemyUpdate } from './target-enemy-update';

createComponentWorker(self, targetEnemyUpdate);
