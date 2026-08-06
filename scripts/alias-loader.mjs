// Minimal Node module resolve hook so plain `node` can run the TypeScript scripts in this folder with the same
// module resolution the app (Vite) and tests (Vitest) rely on: the `@/…` → `src/…` path alias, and Vite's
// extensionless / directory imports (`./player-start`, `@/data/levels`).  Registered via register-alias.mjs, it
// lets the balance report import the real level / ship-type data modules unchanged.
import { fileURLToPath, pathToFileURL } from 'node:url';

const srcRoot = pathToFileURL(fileURLToPath(new URL('../src/', import.meta.url))).href;

// Vite rewrites `import Worker from './foo.worker?worker'` into a Worker constructor.  Node has no such loader (or
// `Worker` global), so point every `?worker` import at a stub constructor instead - the engine runs systems
// in-process under Node and never instantiates it (see worker-stub.mjs).
const workerStub = new URL('./worker-stub.mjs', import.meta.url).href;

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
		// Only extensionless relative / aliased specifiers get the fallback; bare package names are left to Node.
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

export function resolve(specifier, context, nextResolve) {
	if(specifier.endsWith('?worker')) {
		return { url: workerStub, shortCircuit: true };
	}
	if(specifier === '@' || specifier.startsWith('@/')) {
		const rewritten = srcRoot + specifier.slice(specifier === '@' ? 1 : 2);
		return resolveWithExtensions(rewritten, context, nextResolve);
	}
	return resolveWithExtensions(specifier, context, nextResolve);
}
