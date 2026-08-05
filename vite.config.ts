import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

// https://vitejs.dev/config/
// SharedArrayBuffer (used by the shared-memory-ecs workers) requires cross-origin isolation, so both the dev
// server and the preview server (used by the E2E tests against the production build) must send these headers.
const crossOriginIsolationHeaders = {
	'Cross-Origin-Opener-Policy': 'same-origin',
	'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig(({ mode }) => {
	return {
		base: mode === 'production' ? '' : '/',
		resolve: {
			alias: {
				'@': fileURLToPath(new URL('./src', import.meta.url)),
			},
			// shared-memory-physics is linked in from a sibling checkout, so it resolves these two peer dependencies
			// out of its own node_modules unless they are deduped.  Two copies would mean two heaps' worth of module
			// state for components this game registers against the physics library's definitions.
			dedupe: [
				'@daneren2005/shared-memory-ecs',
				'@daneren2005/shared-memory-objects',
			],
		},
		plugins: [],

		build: {
			assetsInlineLimit: 0,
			// Three pages: the game itself, the engine stress test at /stress-test, and the roster showcase at
			// /ship-test (each in its own directory so the URL has no extension and resolves on a plain static host).
			// Naming any input here replaces Vite's default single index.html entry, so the game page has to be
			// listed too.
			rollupOptions: {
				input: {
					main: fileURLToPath(new URL('./index.html', import.meta.url)),
					stressTest: fileURLToPath(new URL('./stress-test/index.html', import.meta.url)),
					shipTest: fileURLToPath(new URL('./ship-test/index.html', import.meta.url)),
				},
			},
		},
		server: {
			port: 8080,
			host: '127.0.0.1',
			headers: crossOriginIsolationHeaders,
		},
		preview: {
			port: 4173,
			host: '127.0.0.1',
			headers: crossOriginIsolationHeaders,
		},

		optimizeDeps: {
			exclude: [
				'@daneren2005/shared-memory-objects',
				'@daneren2005/shared-memory-ecs',
				'@daneren2005/shared-memory-physics',
			],
		},
	};
});
