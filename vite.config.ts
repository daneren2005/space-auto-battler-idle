import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
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
		base: mode === 'production' ? '/space-auto-battler-idle/' : '/',
		resolve: {
			alias: {
				'@': fileURLToPath(new URL('./src', import.meta.url)),
			},
		},
		plugins: [
			vue(),
		],

		build: {
			assetsInlineLimit: 0,
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
			],
		},
	};
});
