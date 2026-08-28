// Node module hooks that let plain `node` run the game with its systems on real worker threads, the way the
// /stress-test page runs them on web workers.  It is the report scripts' alias-loader.mjs (the `@/…` alias +
// Vite's extensionless / directory imports) with one change: instead of pointing every `import X from
// './x.worker?worker'` at a throwing stub (the headless sim runs systems in-process), it resolves each to a
// virtual module that default-exports a `node:worker_threads`-backed Worker constructor (see make-node-worker.mjs).
// This same loader is inherited by every spawned worker thread (through execArgv), so a worker's own `.ts` +
// `@/`-aliased imports resolve identically; worker code never imports a `*.worker?worker`, so the virtual branch
// only ever fires on the main thread.
import { fileURLToPath, pathToFileURL } from 'node:url';

const srcRoot = pathToFileURL(fileURLToPath(new URL('../../src/', import.meta.url))).href;
const makeNodeWorkerUrl = new URL('./make-node-worker.mjs', import.meta.url).href;

// A non-`file:` scheme so `load` can recognise the resolved worker imports and synthesise their source.
const VIRTUAL_PREFIX = 'nodeworker:';

// Node's ESM resolver, unlike Vite/TS, will not append an extension or resolve a directory to its index, so a
// bare `./foo` or `@/data/levels` throws.  Retry those the way Vite would: as `./foo.ts` then `./foo/index.ts`.
async function resolveWithExtensions(specifier, context, nextResolve) {
	try {
		return await nextResolve(specifier, context);
	} catch(error) {
		const code = error?.code;
		if(code !== 'ERR_MODULE_NOT_FOUND' && code !== 'ERR_UNSUPPORTED_DIR_IMPORT') {
			throw error;
		}
		if(!specifier.startsWith('.') && !specifier.startsWith('file:')) {
			throw error;
		}
		for(const suffix of ['.ts', '/index.ts']) {
			try {
				return await nextResolve(specifier + suffix, context);
			} catch{
				// Try the next candidate.
			}
		}
		throw error;
	}
}

export async function resolve(specifier, context, nextResolve) {
	if(specifier.endsWith('?worker')) {
		const base = specifier.slice(0, -'?worker'.length);
		const resolved = await resolveWithExtensions(base, context, nextResolve);
		return { url: VIRTUAL_PREFIX + resolved.url, shortCircuit: true };
	}
	if(specifier === '@' || specifier.startsWith('@/')) {
		const rewritten = srcRoot + specifier.slice(specifier === '@' ? 1 : 2);
		return resolveWithExtensions(rewritten, context, nextResolve);
	}
	return resolveWithExtensions(specifier, context, nextResolve);
}

export function load(url, context, nextLoad) {
	if(url.startsWith(VIRTUAL_PREFIX)) {
		const targetUrl = url.slice(VIRTUAL_PREFIX.length);
		const source = `import makeNodeWorker from ${JSON.stringify(makeNodeWorkerUrl)};\n`
			+ `export default makeNodeWorker(${JSON.stringify(targetUrl)});\n`;
		return { format: 'module', source, shortCircuit: true };
	}
	return nextLoad(url, context);
}
