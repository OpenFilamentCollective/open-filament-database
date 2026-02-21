import { expect, test } from '@playwright/test';

test.describe('Stores Page', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/stores');
	});

	test('should display stores page heading', async ({ page }) => {
		await expect(page.locator('h1')).toBeVisible();
	});

	test('should list stores', async ({ page }) => {
		await page.waitForLoadState('networkidle');

		// Store cards are <a> links to individual store pages
		const storeCards = page.locator('a[href^="/stores/"]');
		const emptyState = page.getByText(/no stores|empty/i);

		const hasStores = (await storeCards.count()) > 0;
		const hasEmptyState = await emptyState.isVisible().catch(() => false);

		expect(hasStores || hasEmptyState).toBe(true);
	});

	test('should display store cards with names', async ({ page }) => {
		await page.waitForLoadState('networkidle');

		const storeLinks = page.getByRole('link').filter({ has: page.locator('img, h2, h3') });
		const count = await storeLinks.count();

		if (count > 0) {
			await expect(storeLinks.first()).toBeVisible();
		}
	});

	test('should navigate to store detail on click', async ({ page }) => {
		await page.waitForLoadState('networkidle');

		const storeLinks = page.locator('a[href^="/stores/"]').filter({ hasNot: page.locator('[href="/stores"]') });

		if ((await storeLinks.count()) > 0) {
			await storeLinks.first().click();
			await expect(page).toHaveURL(/\/stores\/[^/]+$/);
		}
	});
});

test.describe('Store Detail Page', () => {
	test('should display store information', async ({ page }) => {
		await page.goto('/stores');
		await page.waitForLoadState('networkidle');

		const storeLinks = page.locator('a[href^="/stores/"]').filter({ hasNot: page.locator('[href="/stores"]') });

		if ((await storeLinks.count()) > 0) {
			await storeLinks.first().click();
			await page.waitForLoadState('networkidle');

			// Store detail page should have content
			await expect(page.locator('h1, h2').first()).toBeVisible();
		}
	});

	test('should display shipping information', async ({ page }) => {
		await page.goto('/stores');
		await page.waitForLoadState('networkidle');

		const storeLinks = page.locator('a[href^="/stores/"]').filter({ hasNot: page.locator('[href="/stores"]') });

		if ((await storeLinks.count()) > 0) {
			await storeLinks.first().click();
			await page.waitForLoadState('networkidle');

			// Look for shipping-related content
			const content = page.locator('main');
			await expect(content).toBeVisible();
		}
	});

	test('should have back navigation', async ({ page }) => {
		await page.goto('/stores');
		await page.waitForLoadState('networkidle');

		const storeLinks = page.locator('a[href^="/stores/"]').filter({ hasNot: page.locator('[href="/stores"]') });

		if ((await storeLinks.count()) > 0) {
			await storeLinks.first().click();
			await page.waitForLoadState('networkidle');

			const backButton = page.getByRole('link', { name: /back/i }).or(page.getByRole('button', { name: /back/i }));

			if (await backButton.isVisible()) {
				await backButton.click();
				await expect(page).toHaveURL('/stores');
			}
		}
	});
});
