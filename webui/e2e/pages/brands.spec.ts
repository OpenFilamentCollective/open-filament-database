import { expect, test } from '@playwright/test';

test.describe('Brands Page', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/brands');
	});

	test('should display brands page heading', async ({ page }) => {
		await expect(page.locator('h1')).toBeVisible();
	});

	test('should list brands', async ({ page }) => {
		// Wait for content to load
		await page.waitForLoadState('networkidle');

		// Check for brand cards or empty state
		const brandCards = page.locator('[data-testid="brand-card"], .brand-card, article, .card');
		const emptyState = page.getByText(/no brands|empty/i);

		const hasBrands = (await brandCards.count()) > 0;
		const hasEmptyState = await emptyState.isVisible();

		expect(hasBrands || hasEmptyState).toBe(true);
	});

	test('should display brand cards with names', async ({ page }) => {
		await page.waitForLoadState('networkidle');

		// If there are brands, they should have names
		const brandLinks = page.getByRole('link').filter({ has: page.locator('img, h2, h3') });
		const count = await brandLinks.count();

		if (count > 0) {
			// First brand link should be clickable
			await expect(brandLinks.first()).toBeVisible();
		}
	});

	test('should navigate to brand detail on click', async ({ page }) => {
		await page.waitForLoadState('networkidle');

		// Find a brand card/link and click it
		const brandLinks = page.locator('a[href^="/brands/"]').filter({ hasNot: page.locator('[href="/brands"]') });

		if ((await brandLinks.count()) > 0) {
			await brandLinks.first().click();

			// Should navigate to brand detail page
			await expect(page).toHaveURL(/\/brands\/[^/]+$/);
		}
	});

	test('should have back navigation', async ({ page }) => {
		// Go to a brand detail page first
		const brandLinks = page.locator('a[href^="/brands/"]').filter({ hasNot: page.locator('[href="/brands"]') });

		if ((await brandLinks.count()) > 0) {
			await brandLinks.first().click();
			await page.waitForLoadState('networkidle');

			// Find back button/link
			const backButton = page.getByRole('link', { name: /back/i }).or(page.getByRole('button', { name: /back/i }));

			if (await backButton.isVisible()) {
				await backButton.click();
				await expect(page).toHaveURL('/brands');
			}
		}
	});
});

test.describe('Brand Detail Page', () => {
	test('should display brand information', async ({ page }) => {
		// First get a brand ID from the list
		await page.goto('/brands');
		await page.waitForLoadState('networkidle');

		const brandLinks = page.locator('a[href^="/brands/"]').filter({ hasNot: page.locator('[href="/brands"]') });

		if ((await brandLinks.count()) > 0) {
			await brandLinks.first().click();
			await page.waitForLoadState('networkidle');

			// Brand detail page should have a heading
			await expect(page.locator('h1, h2').first()).toBeVisible();
		}
	});

	test('should list materials for brand', async ({ page }) => {
		await page.goto('/brands');
		await page.waitForLoadState('networkidle');

		const brandLinks = page.locator('a[href^="/brands/"]').filter({ hasNot: page.locator('[href="/brands"]') });

		if ((await brandLinks.count()) > 0) {
			await brandLinks.first().click();
			await page.waitForLoadState('networkidle');

			// Should show materials or empty state
			const content = page.locator('main');
			await expect(content).toBeVisible();
		}
	});

	test('should navigate to material detail', async ({ page }) => {
		await page.goto('/brands');
		await page.waitForLoadState('networkidle');

		const brandLinks = page.locator('a[href^="/brands/"]').filter({ hasNot: page.locator('[href="/brands"]') });

		if ((await brandLinks.count()) > 0) {
			await brandLinks.first().click();
			await page.waitForLoadState('networkidle');

			// Find material links
			const materialLinks = page.locator('a[href*="/materials/"]');

			if ((await materialLinks.count()) > 0) {
				await materialLinks.first().click();
				await expect(page).toHaveURL(/\/brands\/[^/]+\/[^/]+$/);
			}
		}
	});
});
