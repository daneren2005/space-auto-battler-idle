import { createEntitySystemWorker } from '@daneren2005/shared-memory-ecs/worker';
import { targetEnemyUpdate } from './target-enemy-update';

createEntitySystemWorker(self, targetEnemyUpdate);
