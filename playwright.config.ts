import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
// The production build is served under this base path (see vite.config.ts).
const baseURL = `http://127.0.0.1:${PORT}/space-auto-battler-idle/`;

// https://playwright.dev/docs/test-configuration
export default defineConfig({
	testDir: './e2e',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: 'list',
	use: {
		baseURL,
		trace: 'on-first-retry',
		screenshot: 'only-on-failure',
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] },
		},
	],
	// Test against the real production build, so `npm run build` must have been run first. The preview
	// server (like the dev server) sends the cross-origin isolation headers that SharedArrayBuffer
	// requires — see vite.config.ts.
	webServer: {
		command: 'npm run preview',
		url: baseURL,
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
	},
});
