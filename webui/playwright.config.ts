import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: 'e2e',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : undefined,
	// Hard caps so a stuck waitForLoadState or pending fetch can't hang the whole job.
	timeout: 30_000,
	expect: { timeout: 5_000 },
	globalTimeout: 20 * 60 * 1000,
	// 'list' streams progress so you can see what's happening; 'html' kept for diagnostics.
	reporter: process.env.CI
		? [['list'], ['html', { open: 'never' }]]
		: [['html', { open: 'never' }]],
	use: {
		baseURL: 'http://localhost:4173',
		trace: 'on-first-retry',
		screenshot: 'only-on-failure',
		actionTimeout: 10_000,
		navigationTimeout: 15_000,
		// Pre-dismiss the welcome modal so it doesn't intercept clicks in tests.
		// Without this, every test that clicks a link fails because the modal
		// overlay (z-50) sits over the page and retries for actionTimeout ms.
		storageState: {
			cookies: [],
			origins: [
				{
					origin: 'http://localhost:4173',
					localStorage: [{ name: 'ofd_welcome_dismissed', value: 'true' }]
				}
			]
		}
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] }
		},
		{
			name: 'firefox',
			use: { ...devices['Desktop Firefox'] }
		}
	],
	webServer: {
		// CI builds in a separate workflow step, so skip the duplicate build there.
		command: process.env.CI ? 'npm run preview' : 'npm run build && npm run preview',
		port: 4173,
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
		env: {
			PUBLIC_APP_MODE: 'local',
			PUBLIC_API_BASE_URL: ''
		}
	}
});
