import { expect, test } from '@playwright/test';
import { getDetailLinks } from '../helpers';

test.describe('Navigation Flow', () => {
	test('should navigate through brand hierarchy', async ({ page }) => {
		// Start at home
		await page.goto('/');

		// Navigate to brands
		await page.getByRole('link', { name: /brands/i }).first().click();
		await expect(page).toHaveURL(/\/brands/);

		await page.waitForLoadState('networkidle');

		// Click on first brand
		const brandLinks = getDetailLinks(page, 'brands');
		if ((await brandLinks.count()) === 0) {
			test.skip();
			return;
		}

		await brandLinks.first().click();
		await expect(page).toHaveURL(/\/brands\/[^/]+$/);

		await page.waitForLoadState('networkidle');

		// Try to find a material link
		const materialLinks = page.locator('a[href*="/materials/"], a[href*="/"][href$="/PLA"], a[href*="/"][href$="/PETG"]');

		if ((await materialLinks.count()) > 0) {
			await materialLinks.first().click();

			// Should be on material page
			await expect(page).toHaveURL(/\/brands\/[^/]+\/[^/]+$/);
		}
	});

	test('should navigate back using browser back button', async ({ page }) => {
		await page.goto('/');

		// Navigate forward
		await page.getByRole('link', { name: /brands/i }).first().click();
		await expect(page).toHaveURL(/\/brands/);

		// Go back
		await page.goBack();
		await expect(page).toHaveURL('/');
	});

	test('should maintain state when navigating', async ({ page }) => {
		// Go to brands
		await page.goto('/brands');
		await page.waitForLoadState('networkidle');

		// Count brands
		const brandLinks = getDetailLinks(page, 'brands');
		const initialCount = await brandLinks.count();

		// Navigate away and back
		await page.goto('/stores');
		await page.goto('/brands');
		await page.waitForLoadState('networkidle');

		// Count should be the same
		const newCount = await brandLinks.count();
		expect(newCount).toBe(initialCount);
	});

	test('should handle direct URL navigation', async ({ page }) => {
		// Navigate directly to a nested route
		await page.goto('/brands');
		await page.waitForLoadState('networkidle');

		const brandLinks = getDetailLinks(page, 'brands');

		if ((await brandLinks.count()) > 0) {
			const href = await brandLinks.first().getAttribute('href');
			if (href) {
				// Navigate directly to that URL
				await page.goto(href);
				await expect(page).toHaveURL(href);
			}
		}
	});
});

test.describe('Error Handling', () => {
	test('should handle 404 pages gracefully', async ({ page }) => {
		await page.goto('/non-existent-page');

		// Should show some kind of error or redirect
		const content = page.locator('body');
		await expect(content).toBeVisible();
	});

	test('should handle non-existent brand', async ({ page }) => {
		await page.goto('/brands/non-existent-brand-xyz-123');

		// Should show error or redirect
		await page.waitForLoadState('networkidle');
		const content = page.locator('body');
		await expect(content).toBeVisible();
	});

	test('should handle non-existent store', async ({ page }) => {
		await page.goto('/stores/non-existent-store-xyz-123');

		// Should show error or redirect
		await page.waitForLoadState('networkidle');
		const content = page.locator('body');
		await expect(content).toBeVisible();
	});
});

test.describe('Responsive Design', () => {
	test('should work on mobile viewport', async ({ page }) => {
		await page.setViewportSize({ width: 375, height: 667 });
		await page.goto('/');

		// Page should still be visible and usable
		await expect(page.locator('h1')).toBeVisible();
	});

	test('should work on tablet viewport', async ({ page }) => {
		await page.setViewportSize({ width: 768, height: 1024 });
		await page.goto('/brands');

		await expect(page.locator('h1')).toBeVisible();
	});

	test('should work on desktop viewport', async ({ page }) => {
		await page.setViewportSize({ width: 1920, height: 1080 });
		await page.goto('/brands');

		await expect(page.locator('h1')).toBeVisible();
	});
});
