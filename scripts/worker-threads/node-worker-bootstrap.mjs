// Entry each benchmark worker thread runs.  The game's `*.worker.ts` files call `createEntitySystemWorker(self, ...)`
// expecting a browser Worker scope; under `node:worker_threads` there is no `self`, so this bridges one to this
// thread's `parentPort` (same onmessage/postMessage shape), then imports the real worker module unchanged.  The
// module path rides in `workerData` (see make-node-worker.mjs).  Registered TS transform + `@/` alias hooks are
// inherited through the parent's execArgv, so importing a `.ts` worker + its `@/`-aliased deps just works.
import { parentPort, workerData } from 'node:worker_threads';

if(!parentPort) {
	throw new Error('node-worker-bootstrap must be run as a worker thread');
}

// createEntitySystemWorker only assigns `self.onmessage` after this file finishes importing it, but the parent posts
// `init` the instant the worker is constructed - which flushes here first.  Buffer anything that lands before the
// handler exists and replay it the moment it is set, or that early `init` is dropped and the worker never loads.
const queue = [];
let handler = null;
const scope = {
	get onmessage() {
		return handler;
	},
	set onmessage(next) {
		handler = next;
		if(next) {
			const pending = queue.splice(0);
			for(const data of pending) {
				next({ data });
			}
		}
	},
	postMessage: message => parentPort.postMessage(message),
};
globalThis.self = scope;
parentPort.on('message', data => {
	if(handler) {
		handler({ data });
	} else {
		queue.push(data);
	}
});

await import(workerData.targetUrl);
