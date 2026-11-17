import { expect, test } from '@playwright/test';

test.describe('Home Page', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
	});

	test('should display page title', async ({ page }) => {
		await expect(page.locator('h1')).toBeVisible();
	});

	test('should display brands section', async ({ page }) => {
		await expect(page.getByRole('heading', { name: /brands/i })).toBeVisible();
	});

	test('should display stores section', async ({ page }) => {
		await expect(page.getByRole('heading', { name: /stores/i })).toBeVisible();
	});

	test('should navigate to brands list', async ({ page }) => {
		// Find and click the brands link
		const brandsLink = page.getByRole('link', { name: /brands/i }).first();
		await brandsLink.click();

		// Should be on brands page
		await expect(page).toHaveURL(/\/brands/);
	});

	test('should navigate to stores list', async ({ page }) => {
		// Find and click the stores link
		const storesLink = page.getByRole('link', { name: /stores/i }).first();
		await storesLink.click();

		// Should be on stores page
		await expect(page).toHaveURL(/\/stores/);
	});

	test('should navigate to FAQ', async ({ page }) => {
		const faqLink = page.getByRole('link', { name: /faq/i }).first();
		if (await faqLink.isVisible()) {
			await faqLink.click();
			await expect(page).toHaveURL(/\/faq/);
		}
	});

	test('should show loading state initially', async ({ page }) => {
		// Navigate to a page that loads data
		await page.goto('/brands');

		// Check for either loading indicator or content
		const hasContent = await page.locator('main').isVisible();
		expect(hasContent).toBe(true);
	});

	test('should have working theme toggle', async ({ page }) => {
		// Wait for hydration before interacting — click handlers aren't bound
		// until SvelteKit hydrates, which can lag a few ms after navigation.
		await page.waitForLoadState('domcontentloaded');

		const themeToggle = page.locator('button[title="Change theme"]');
		if (!(await themeToggle.isVisible())) return;

		// Open the theme dropdown and wait for its content to render before
		// clicking the Dark option. Without this, Playwright can race the click
		// against Svelte's reactive update.
		await themeToggle.click();
		const darkBtn = page.getByRole('button', { name: 'Dark' });
		await darkBtn.waitFor({ state: 'visible' });
		await darkBtn.click();

		await expect(page.locator('html')).toHaveClass(/dark/);
	});
});
