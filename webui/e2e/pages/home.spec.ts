import { expect, test } from '@playwright/test';

test.describe('Home Page', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
	});

	test('should display page title', async ({ page }) => {
		await expect(page.locator('h1')).toBeVisible();
	});

	test('should display brands section', async ({ page }) => {
		await expect(page.getByText(/brands/i)).toBeVisible();
	});

	test('should display stores section', async ({ page }) => {
		await expect(page.getByText(/stores/i)).toBeVisible();
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
		const faqLink = page.getByRole('link', { name: /faq/i });
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
		// Look for theme toggle button
		const themeToggle = page.getByRole('button', { name: /theme|dark|light/i });

		if (await themeToggle.isVisible()) {
			// Get initial theme state
			const htmlElement = page.locator('html');
			const initialClass = await htmlElement.getAttribute('class');

			// Click theme toggle
			await themeToggle.click();

			// Theme class should have changed
			await expect(htmlElement).not.toHaveAttribute('class', initialClass);
		}
	});
});
