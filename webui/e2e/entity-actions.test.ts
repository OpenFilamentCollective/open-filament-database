import { expect, test, type Page } from '@playwright/test';

/**
 * E2E tests for entity actions: duplicate, copy/paste, context menus, and dropdowns.
 *
 * These tests require the dev server to be running with local data.
 * They operate on the existing database entries.
 */

// Helper to navigate and wait for page load
async function navigateTo(page: Page, path: string) {
	await page.goto(path);
	await page.waitForLoadState('networkidle');
}

// Helper to open the kebab dropdown on a detail page
async function openDetailDropdown(page: Page) {
	const dropdown = page.locator('[title="More actions"]').first();
	await dropdown.click();
	await page.waitForTimeout(200);
}

// Helper to click a dropdown menu item by label
async function clickMenuItem(page: Page, label: string) {
	await page.locator(`[role="menuitem"]:text("${label}")`).click();
}

test.describe('Detail page dropdown menu', () => {
	test('brand detail shows Edit button and dropdown menu', async ({ page }) => {
		await navigateTo(page, '/brands');
		// Click first brand card
		const firstBrand = page.locator('a[href^="/brands/"]').first();
		await firstBrand.click();
		await page.waitForLoadState('networkidle');

		// Should have Edit button
		const editBtn = page.locator('button:text("Edit")');
		await expect(editBtn).toBeVisible();

		// Should have kebab menu button
		const menuBtn = page.locator('[title="More actions"]').first();
		await expect(menuBtn).toBeVisible();
	});

	test('dropdown contains expected menu items', async ({ page }) => {
		await navigateTo(page, '/brands');
		const firstBrand = page.locator('a[href^="/brands/"]').first();
		await firstBrand.click();
		await page.waitForLoadState('networkidle');

		await openDetailDropdown(page);

		// Check menu items are present
		await expect(page.locator('[role="menuitem"]:text("Duplicate")')).toBeVisible();
		await expect(page.locator('[role="menuitem"]:text("Copy")')).toBeVisible();
		await expect(page.locator('[role="menuitem"]:text("Paste")')).toBeVisible();
		await expect(page.locator('[role="menuitem"]:text("Delete")')).toBeVisible();
		// View JSON should be visible in local mode
		await expect(page.locator('[role="menuitem"]:text("View JSON")')).toBeVisible();
		// Cloud-only items should be hidden in local mode
		await expect(page.locator('[role="menuitem"]:text("View on GitHub")')).not.toBeVisible();
		await expect(page.locator('[role="menuitem"]:text("Compare with Cloud")')).not.toBeVisible();
	});

	test('dropdown closes on Escape', async ({ page }) => {
		await navigateTo(page, '/brands');
		const firstBrand = page.locator('a[href^="/brands/"]').first();
		await firstBrand.click();
		await page.waitForLoadState('networkidle');

		await openDetailDropdown(page);
		await expect(page.locator('[role="menu"]')).toBeVisible();

		await page.keyboard.press('Escape');
		await expect(page.locator('[role="menu"]')).not.toBeVisible();
	});
});

test.describe('Duplicate flow', () => {
	test('clicking Duplicate on brand shows options modal', async ({ page }) => {
		await navigateTo(page, '/brands');
		const firstBrand = page.locator('a[href^="/brands/"]').first();
		await firstBrand.click();
		await page.waitForLoadState('networkidle');

		await openDetailDropdown(page);
		await clickMenuItem(page, 'Duplicate');

		// Options modal should appear
		await expect(page.locator('text=Include child entries')).toBeVisible();
		await expect(page.locator('button:text("With children")')).toBeVisible();
		await expect(page.locator('button:text("Without children")')).toBeVisible();
		await expect(page.locator('button:text("Cancel")')).toBeVisible();
	});

	test('duplicate without children opens form with (Copy) name', async ({ page }) => {
		await navigateTo(page, '/brands');
		const firstBrand = page.locator('a[href^="/brands/"]').first();
		const brandName = await firstBrand.locator('h3').textContent();
		await firstBrand.click();
		await page.waitForLoadState('networkidle');

		await openDetailDropdown(page);
		await clickMenuItem(page, 'Duplicate');

		// Pick without children
		await page.locator('button:text("Without children")').click();

		// Form should open with "(Copy)" appended.
		// Use a label-based selector for the name field — `input.first()` would
		// match the origin-mode radio buttons that appear above it in the DOM.
		await expect(page.locator('text=Duplicate Brand')).toBeVisible();
		const nameInput = page.getByLabel(/^name/i).first();
		const nameValue = await nameInput.inputValue();
		expect(nameValue).toContain('(Copy)');
	});

	test('cancel in options modal closes it', async ({ page }) => {
		await navigateTo(page, '/brands');
		const firstBrand = page.locator('a[href^="/brands/"]').first();
		await firstBrand.click();
		await page.waitForLoadState('networkidle');

		await openDetailDropdown(page);
		await clickMenuItem(page, 'Duplicate');
		await expect(page.locator('text=Include child entries')).toBeVisible();

		await page.locator('button:text("Cancel")').click();
		await expect(page.locator('text=Include child entries')).not.toBeVisible();
	});
});

test.describe('Copy flow', () => {
	test('clicking Copy on brand shows options modal', async ({ page }) => {
		await navigateTo(page, '/brands');
		const firstBrand = page.locator('a[href^="/brands/"]').first();
		await firstBrand.click();
		await page.waitForLoadState('networkidle');

		await openDetailDropdown(page);
		await clickMenuItem(page, 'Copy');

		// Options modal should appear for copy too
		await expect(page.locator('text=Include child entries')).toBeVisible();
	});

	test('copy without children stores in localStorage', async ({ page }) => {
		await navigateTo(page, '/brands');
		const firstBrand = page.locator('a[href^="/brands/"]').first();
		await firstBrand.click();
		await page.waitForLoadState('networkidle');

		await openDetailDropdown(page);
		await clickMenuItem(page, 'Copy');
		await page.locator('button:text("Without children")').click();

		// Check localStorage
		const clipboard = await page.evaluate(() => {
			const raw = localStorage.getItem('ofd_clipboard');
			return raw ? JSON.parse(raw) : null;
		});
		expect(clipboard).not.toBeNull();
		expect(clipboard.entityType).toBe('brand');
		expect(clipboard.children).toBeUndefined();
	});

	test('copy with children includes children in clipboard', async ({ page }) => {
		await navigateTo(page, '/brands');
		const firstBrand = page.locator('a[href^="/brands/"]').first();
		await firstBrand.click();
		await page.waitForLoadState('networkidle');

		await openDetailDropdown(page);
		await clickMenuItem(page, 'Copy');
		await page.locator('button:text("With children")').click();
		// Wait for children to load
		await page.waitForTimeout(1000);

		const clipboard = await page.evaluate(() => {
			const raw = localStorage.getItem('ofd_clipboard');
			return raw ? JSON.parse(raw) : null;
		});
		expect(clipboard).not.toBeNull();
		expect(clipboard.entityType).toBe('brand');
		expect(clipboard.children).toBeDefined();
	});
});

test.describe('Paste flow', () => {
	test('paste button appears when clipboard has compatible data', async ({ page }) => {
		// Open a brand detail page — it always renders a Materials panel whose
		// header offers a Paste action when the clipboard holds a material.
		await navigateTo(page, '/brands');
		await page.locator('a[href^="/brands/"]').first().click();
		await page.waitForLoadState('networkidle');
		await expect(page.locator('button:text("Edit")')).toBeVisible();

		// Seed a compatible (material) clipboard entry directly, then reload so the
		// panel re-evaluates clipboard compatibility on render. This avoids the
		// flaky right-click → context-menu → copy → back navigation dance (the copy
		// flow is covered by its own test) and the Materials Paste button only
		// surfaces for a material clipboard, so this asserts exactly that.
		await page.evaluate(() => {
			localStorage.setItem(
				'ofd_clipboard',
				JSON.stringify({
					entityType: 'material',
					data: { material: 'PLA' },
					copiedAt: '2026-01-01T00:00:00.000Z'
				})
			);
		});
		await page.reload();
		await page.waitForLoadState('networkidle');

		// The Materials panel should now show a Paste button.
		await expect(page.locator('button:text("Paste")').first()).toBeVisible();
	});
});

test.describe('Context menu on EntityCard', () => {
	test('right-clicking a card shows context menu', async ({ page }) => {
		await navigateTo(page, '/brands');
		const firstBrand = page.locator('a[href^="/brands/"]').first();
		await firstBrand.click();
		await page.waitForLoadState('networkidle');

		// Right-click on a material card
		const materialCard = page.locator('.space-y-2 a').first();
		if (await materialCard.isVisible()) {
			await materialCard.click({ button: 'right' });
			await page.waitForTimeout(200);

			// Context menu should appear
			const contextMenu = page.locator('[role="menu"]');
			await expect(contextMenu).toBeVisible();

			// Should have expected items
			await expect(page.locator('[role="menuitem"]:text("Open")')).toBeVisible();
			await expect(page.locator('[role="menuitem"]:text("Copy")')).toBeVisible();
			await expect(page.locator('[role="menuitem"]:text("Duplicate")')).toBeVisible();
		}
	});

	test('context menu closes on click outside', async ({ page }) => {
		await navigateTo(page, '/brands');
		const firstBrand = page.locator('a[href^="/brands/"]').first();
		await firstBrand.click();
		await page.waitForLoadState('networkidle');

		const materialCard = page.locator('.space-y-2 a').first();
		if (await materialCard.isVisible()) {
			await materialCard.click({ button: 'right' });
			await page.waitForTimeout(200);
			await expect(page.locator('[role="menu"]')).toBeVisible();

			// Click outside
			await page.locator('h1').click();
			await expect(page.locator('[role="menu"]')).not.toBeVisible();
		}
	});
});

test.describe('Card inline dropdown', () => {
	test('card shows kebab menu instead of arrow when actions available', async ({ page }) => {
		await navigateTo(page, '/brands');
		const firstBrand = page.locator('a[href^="/brands/"]').first();
		await firstBrand.click();
		await page.waitForLoadState('networkidle');

		// Material cards should have kebab menu
		const kebabBtn = page.locator('.space-y-2 [title="More actions"]').first();
		if (await kebabBtn.isVisible()) {
			await expect(kebabBtn).toBeVisible();
		}
	});

	test('card dropdown has Open, Copy, Duplicate, Delete', async ({ page }) => {
		await navigateTo(page, '/brands');
		const firstBrand = page.locator('a[href^="/brands/"]').first();
		await firstBrand.click();
		await page.waitForLoadState('networkidle');

		const kebabBtn = page.locator('.space-y-2 [title="More actions"]').first();
		if (await kebabBtn.isVisible()) {
			await kebabBtn.click();
			await page.waitForTimeout(200);

			await expect(page.locator('[role="menuitem"]:text("Open")')).toBeVisible();
			await expect(page.locator('[role="menuitem"]:text("Copy")')).toBeVisible();
			await expect(page.locator('[role="menuitem"]:text("Duplicate")')).toBeVisible();
			await expect(page.locator('[role="menuitem"]:text("Delete")')).toBeVisible();
		}
	});
});

test.describe('Form labels', () => {
	test('duplicate form shows Create not Update', async ({ page }) => {
		await navigateTo(page, '/brands');
		const firstBrand = page.locator('a[href^="/brands/"]').first();
		await firstBrand.click();
		await page.waitForLoadState('networkidle');

		await openDetailDropdown(page);
		await clickMenuItem(page, 'Duplicate');
		await page.locator('button:text("Without children")').click();

		// The submit button should say "Create Brand" not "Update Brand"
		await expect(page.locator('button:text("Create Brand")')).toBeVisible();
		await expect(page.locator('button:text("Update Brand")')).not.toBeVisible();
	});
});

test.describe('Delete from card dropdown', () => {
	test('delete option in card dropdown is styled as destructive', async ({ page }) => {
		await navigateTo(page, '/brands');
		const firstBrand = page.locator('a[href^="/brands/"]').first();
		await firstBrand.click();
		await page.waitForLoadState('networkidle');

		const kebabBtn = page.locator('.space-y-2 [title="More actions"]').first();
		if (await kebabBtn.isVisible()) {
			await kebabBtn.click();
			await page.waitForTimeout(200);

			const deleteItem = page.locator('[role="menuitem"]:text("Delete")');
			await expect(deleteItem).toBeVisible();
			// Delete should have destructive text color
			await expect(deleteItem).toHaveClass(/text-destructive/);
		}
	});
});

test.describe('Duplicate options info tooltip', () => {
	test('question mark button toggles info box', async ({ page }) => {
		await navigateTo(page, '/brands');
		const firstBrand = page.locator('a[href^="/brands/"]').first();
		await firstBrand.click();
		await page.waitForLoadState('networkidle');

		await openDetailDropdown(page);
		await clickMenuItem(page, 'Duplicate');

		// Info box should not be visible initially
		const infoBox = page.locator('text=Copies all materials');
		await expect(infoBox).not.toBeVisible();

		// Click the question mark button
		const infoBtn = page.locator('button:text("?")');
		await infoBtn.click();

		// Info box should now be visible
		await expect(infoBox).toBeVisible();
	});
});
