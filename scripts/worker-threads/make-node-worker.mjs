// Stands in for Vite's `import Worker from './x.worker?worker'` when the benchmark runs the game under plain Node.
// Vite hands back a Worker constructor; this returns one too, but backed by a `node:worker_threads` Worker so the
// system's update really runs on its own OS thread (the whole point of the stress benchmark).  The returned class
// exposes the same tiny surface shared-memory-ecs uses on a web Worker: a settable `onmessage`, `postMessage`, and
// `terminate` (which lets `world.destroy()` free the thread so the process can exit).  SharedArrayBuffers ride
// `postMessage`'s structured clone shared, not copied, so both threads read and write the same memory.
import { Worker } from 'node:worker_threads';

const bootstrapUrl = new URL('./node-worker-bootstrap.mjs', import.meta.url);

export default function makeNodeWorker(targetUrl) {
	return class NodeComponentWorker {
		constructor() {
			this.onmessage = null;
			this.worker = new Worker(bootstrapUrl, { workerData: { targetUrl } });
			this.worker.on('message', data => {
				this.onmessage?.({ data });
			});
			this.worker.on('error', error => {
				console.error(`worker ${targetUrl} failed:`, error);
			});
		}

		postMessage(message) {
			this.worker.postMessage(message);
		}

		terminate() {
			return this.worker.terminate();
		}
	};
}
