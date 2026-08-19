import { expect, test, type Page } from '@playwright/test';

/**
 * Delete is redirect-first: the modal opens on a replacement picker so the deleted
 * entry's canonical UUID lands on its replacement's `moved_from`. Deleting outright
 * is still possible, but only behind an explicit "Can't be redirected…" step.
 *
 * Change tracking is always on (see stores/environment.ts), so everything these
 * tests confirm is staged in localStorage — nothing touches the data directory.
 */

async function waitForLoad(page: Page) {
	await page.waitForLoadState('networkidle');
}

/** Follow the first link that is exactly one path segment below `parentPath`. */
async function openFirstChild(page: Page, parentPath: string): Promise<string> {
	const depth = parentPath.split('/').length + 1;
	for (const anchor of await page.locator('a[href]').all()) {
		const href = await anchor.getAttribute('href');
		if (href?.startsWith(`${parentPath}/`) && href.split('/').length === depth) {
			await anchor.click();
			await waitForLoad(page);
			return href;
		}
	}
	throw new Error(`No child link found under ${parentPath}`);
}

/** Navigate brands → first brand → first material → first filament. */
async function openFirstFilament(page: Page): Promise<string> {
	await page.goto('/brands');
	await waitForLoad(page);
	const brandHref = await openFirstChild(page, '/brands');

	await page.getByRole('button', { name: /add material/i }).waitFor({ timeout: 15000 });
	const materialHref = await openFirstChild(page, brandHref);

	await page.getByRole('button', { name: /add filament/i }).waitFor({ timeout: 15000 });
	return openFirstChild(page, materialHref);
}

async function openDeleteModal(page: Page) {
	await page.locator('[title="More actions"]').first().click();
	const deleteItem = page.locator('[role="menuitem"]:text("Delete")');
	await deleteItem.waitFor({ state: 'visible', timeout: 5000 });
	await deleteItem.click();
	return page.getByRole('dialog');
}

test.describe('Redirect-first delete', () => {
	// The picker's first query waits on /api/search-index, which walks the whole data
	// tree in local mode — slow enough under parallel workers to blow the 30s default.
	test.describe.configure({ timeout: 60_000 });

	test('the picker comes first, and confirming records the redirect', async ({ page }) => {
		const filamentHref = await openFirstFilament(page);
		const modal = await openDeleteModal(page);

		// Redirect pane, with the destructive action gated on picking a replacement.
		await expect(modal.getByText(/pick what replaces/i)).toBeVisible();
		const confirmBtn = modal.getByRole('button', { name: /redirect & delete/i });
		await expect(confirmBtn).toBeDisabled();

		// Filaments are indexed with their material type, so it is a query
		// guaranteed to match siblings. /brands/<brand>/<materialType>/<filament>
		const materialType = filamentHref.split('/')[3];
		await modal.getByPlaceholder(/search/i).fill(materialType);

		const replacement = modal.locator('ul button').first();
		await replacement.waitFor({ state: 'visible', timeout: 20000 });
		const replacementName = (await replacement.locator('div').first().textContent())?.trim();
		await replacement.click();

		await expect(modal.getByText(/redirect to:/i)).toBeVisible();
		await expect(confirmBtn).toBeEnabled();
		await confirmBtn.click();

		// The banner names both ends, and we land on the replacement.
		await expect(page.getByText(new RegExp(`Redirected .* → "${replacementName}"`))).toBeVisible({
			timeout: 5000
		});
		await page.waitForURL((url) => url.pathname !== filamentHref, { timeout: 5000 });
		await expect(page.getByRole('heading', { level: 1, name: replacementName! })).toBeVisible();

		// Both halves are staged: the redirect on the replacement, the delete on the source.
		await page
			.getByRole('button', { name: /changes/i })
			.first()
			.click();
		await expect(page.getByText(/Updated filament/i).first()).toBeVisible();
		await expect(page.getByText(/Deleted filament/i).first()).toBeVisible();
	});

	test('"Can\'t be redirected" switches to a plain confirmation', async ({ page }) => {
		await openFirstFilament(page);
		const modal = await openDeleteModal(page);

		await modal.getByRole('button', { name: /can.t be redirected/i }).click();

		await expect(modal.getByText(/are you sure/i)).toBeVisible();
		await expect(modal.getByText(/no redirect will be recorded/i)).toBeVisible();
		await expect(modal.getByRole('button', { name: 'Delete' })).toBeEnabled();

		// And back again — neither pane is a dead end.
		await modal.getByRole('button', { name: /redirect instead/i }).click();
		await expect(modal.getByText(/pick what replaces/i)).toBeVisible();
	});

	test('a child card opens the same modal, stays on the page, and then stops offering Delete', async ({
		page
	}) => {
		await page.goto('/brands');
		await waitForLoad(page);
		const brandHref = await openFirstChild(page, '/brands');
		await page.getByRole('button', { name: /add material/i }).waitFor({ timeout: 15000 });
		const materialHref = await openFirstChild(page, brandHref);
		await page.getByRole('button', { name: /add filament/i }).waitFor({ timeout: 15000 });

		const card = page.locator(`a[href^="${materialHref}/"]`).first();
		const cardHref = await card.getAttribute('href');
		const cardName = (await card.getByRole('heading').textContent())?.trim();

		await card.getByTitle('More actions').click();
		await page.locator('[role="menuitem"]:text("Delete")').click();

		// The modal describes the card's filament, not the material the page is showing.
		const modal = page.getByRole('dialog');
		await expect(modal.getByRole('heading', { name: 'Delete Filament' })).toBeVisible();
		await expect(modal.getByText(cardName!)).toBeVisible();

		// Card list payloads carry no `uuid`, so the flow has to fetch the entity —
		// without that, this opens on the "nothing to redirect" pane.
		await expect(modal.getByText(/pick what replaces/i)).toBeVisible();
		await expect(modal.getByText(/UUID:/)).toBeVisible();

		await modal.getByRole('button', { name: /can.t be redirected/i }).click();
		await modal.getByRole('button', { name: 'Delete' }).click();

		// Child deletes never navigate; the card turns into a "Deleted" stub.
		await expect(page.getByText(/marked for deletion|creation removed/i)).toBeVisible();
		expect(new URL(page.url()).pathname).toBe(materialHref);
		const stub = page.locator(`a[href="${cardHref}"]`);
		await expect(stub.getByText('Deleted')).toBeVisible();

		// Nothing left to delete or redirect on an entry already staged for deletion.
		await stub.getByTitle('More actions').click();
		await expect(page.locator('[role="menuitem"]:text("Delete")')).toHaveCount(0);
	});

	test('variants are picked in two steps, since they are not indexed', async ({ page }) => {
		const filamentHref = await openFirstFilament(page);
		await page.getByRole('button', { name: /add variant/i }).waitFor({ timeout: 15000 });
		await openFirstChild(page, filamentHref);

		const modal = await openDeleteModal(page);
		await expect(modal.getByText(/pick what replaces/i)).toBeVisible();

		// Step 1 searches filaments…
		const materialType = filamentHref.split('/')[3];
		await modal.getByPlaceholder(/filament/i).fill(materialType);
		const filamentResult = modal.locator('ul button').first();
		await filamentResult.waitFor({ state: 'visible', timeout: 20000 });
		await filamentResult.click();

		// …step 2 lists that filament's variants.
		await expect(modal.getByText(/variants of/i)).toBeVisible();
		await expect(modal.getByRole('button', { name: /change filament/i })).toBeVisible();
	});
});
