// Registers the worker-thread module hooks (worker-alias-loader.mjs) so `node --import
// ./scripts/worker-threads/register-worker-alias.mjs` runs the game with its systems on real worker threads.
// Every spawned worker inherits this same `--import` through execArgv, so the hooks are active on every thread.
import { register } from 'node:module';

register('./worker-alias-loader.mjs', import.meta.url);
