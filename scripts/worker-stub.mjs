// Stand-in for Vite's `import X from './foo.worker?worker'` when the game runs under plain Node (the headless
// simulation scripts).  In the browser that import hands back a Worker constructor; in Node there is no `Worker`
// global, so shared-memory-ecs runs every system's update function in-process and never asks a system for its
// worker (see game-component-system / the vitest.config note).  The constructor is therefore never called - this
// only has to exist so the `?worker` import resolves.  If it ever were instantiated, throwing makes that loud
// rather than silently doing nothing.
export default class WorkerStub {
	constructor() {
		throw new Error('Web Workers are not available under Node; the simulation must run systems in-process.');
	}
}
