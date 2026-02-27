import { expect, test } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOGO_PATH = path.resolve(__dirname, '../../..', 'docs/img/logo.png');

// Test data for full tree creation
const TEST_BRAND_NAME = 'E2E Test Brand';
const TEST_STORE_NAME = 'E2E Test Store';
const TEST_FILAMENT_NAME = 'E2E Test Filament';
const TEST_VARIANT_NAME = 'E2E Test Black';
const TEST_ADD_FILAMENT_NAME = 'E2E Added Filament';
const TEST_ADD_VARIANT_NAME = 'E2E Added Variant';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Wait for the page to finish loading data */
async function waitForLoad(page: import('@playwright/test').Page) {
	await page.waitForLoadState('networkidle');
}

/** Fill a UrlField component (protocol dropdown + body input) by its input id.
 *  Uses native value setter + input event to work around Svelte reactivity timing issues. */
async function fillUrlField(page: import('@playwright/test').Page, inputId: string, urlBody: string) {
	await page.evaluate(({ id, val }) => {
		const input = document.getElementById(id) as HTMLInputElement;
		if (input) {
			const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
				HTMLInputElement.prototype, 'value'
			)!.set!;
			nativeInputValueSetter.call(input, val);
			input.dispatchEvent(new Event('input', { bubbles: true }));
		}
	}, { id: inputId, val: urlBody });
}

/** Upload the project logo via the hidden file input and handle crop modal */
async function uploadLogo(page: import('@playwright/test').Page) {
	const fileInput = page.locator('input[type="file"]');
	await fileInput.setInputFiles(LOGO_PATH);
	// Crop modal appears for raster (PNG) images
	const applyCrop = page.getByRole('button', { name: /apply crop/i });
	await applyCrop.waitFor({ state: 'visible', timeout: 5000 });
	await applyCrop.click();
	// Wait for crop processing to complete
	await page.waitForTimeout(500);
}

/** Get all entity links on a list/detail page matching a prefix pattern */
async function getEntityLinks(page: import('@playwright/test').Page, hrefPrefix: string) {
	await waitForLoad(page);
	// Match links one level deeper than the prefix (e.g., /brands/something but not /brands itself)
	const regex = new RegExp(`^${hrefPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/[^/]+$`);
	const allLinks = await page.locator('a[href]').all();
	const matching: import('@playwright/test').Locator[] = [];
	for (const link of allLinks) {
		const href = await link.getAttribute('href');
		if (href && regex.test(href)) {
			matching.push(link);
		}
	}
	return matching;
}

/** Collect all visible <a> links that are exactly one path segment deeper than parentPath */
async function getChildLinks(page: import('@playwright/test').Page, parentPath: string) {
	const depth = parentPath.split('/').length + 1;
	const prefix = parentPath + '/';
	const links: import('@playwright/test').Locator[] = [];
	const allAnchors = await page.locator('a[href]').all();
	for (const a of allAnchors) {
		const href = await a.getAttribute('href');
		if (href && href.startsWith(prefix) && href.split('/').length === depth) {
			links.push(a);
		}
	}
	return links;
}

/** Navigate deep into the brand hierarchy and return the URL segments */
async function navigateDeep(
	page: import('@playwright/test').Page,
	depth: 'brand' | 'material' | 'filament' | 'variant',
	position: 'first' | 'last' = 'first'
) {
	// Start at brands list
	await page.goto('/brands');
	await waitForLoad(page);

	// Pick a brand
	const brandLinks = await getEntityLinks(page, '/brands');
	expect(brandLinks.length).toBeGreaterThan(0);
	const brandLink = position === 'last' ? brandLinks[brandLinks.length - 1] : brandLinks[0];
	const brandHref = await brandLink.getAttribute('href');
	await brandLink.click();
	await waitForLoad(page);
	if (depth === 'brand') return { brandHref };

	// Wait for materials section to render (the "Add Material" button is unique to the brand detail page)
	await page.getByRole('button', { name: /add material/i }).waitFor({ state: 'visible', timeout: 15000 });
	await page.waitForTimeout(300);
	const matLinks = await getChildLinks(page, brandHref!);
	expect(matLinks.length).toBeGreaterThan(0);
	const matLink = position === 'last' ? matLinks[matLinks.length - 1] : matLinks[0];
	const matHref = await matLink.getAttribute('href');
	await matLink.click();
	await waitForLoad(page);
	if (depth === 'material') return { brandHref, materialHref: matHref };

	// Wait for filaments section to render
	await page.getByRole('button', { name: /add filament/i }).waitFor({ state: 'visible', timeout: 15000 });
	await page.waitForTimeout(300);
	const filLinks = await getChildLinks(page, matHref!);
	expect(filLinks.length).toBeGreaterThan(0);
	const filLink = position === 'last' ? filLinks[filLinks.length - 1] : filLinks[0];
	const filHref = await filLink.getAttribute('href');
	await filLink.click();
	await waitForLoad(page);
	if (depth === 'filament') return { brandHref, materialHref: matHref, filamentHref: filHref };

	// Wait for variants section to render
	await page.getByRole('button', { name: /add variant/i }).waitFor({ state: 'visible', timeout: 15000 });
	await page.waitForTimeout(300);
	const varLinks = await getChildLinks(page, filHref!);
	expect(varLinks.length).toBeGreaterThan(0);
	const varLink = position === 'last' ? varLinks[varLinks.length - 1] : varLinks[0];
	const varHref = await varLink.getAttribute('href');
	await varLink.click();
	await waitForLoad(page);
	return { brandHref, materialHref: matHref, filamentHref: filHref, variantHref: varHref };
}

// ===========================================================================
// Tests — run serially so they can share state and order matters
// ===========================================================================

test.describe.serial('CRUD Operations', () => {
	// -----------------------------------------------------------------------
	// 1. DELETE one entry at every level
	// -----------------------------------------------------------------------

	test('delete a variant', async ({ page }) => {
		const result = await navigateDeep(page, 'variant', 'last');

		// Click Delete in ActionButtons
		await page.getByRole('button', { name: 'Delete' }).click();

		// Confirm in DeleteConfirmationModal
		const modal = page.getByRole('dialog');
		await expect(modal.getByText(/are you sure/i)).toBeVisible();
		await modal.getByRole('button', { name: 'Delete' }).click();

		// Wait for success message and redirect (1500ms delay in local mode)
		await expect(page.getByText(/successfully|deleted/i)).toBeVisible({ timeout: 5000 });
		await page.waitForURL(`**${result.filamentHref}`, { timeout: 5000 });
		await waitForLoad(page);
	});

	test('delete a filament', async ({ page }) => {
		// Navigate to a filament (use last to get a different one than the variant's parent)
		const result = await navigateDeep(page, 'filament', 'last');

		await page.getByRole('button', { name: 'Delete' }).click();
		const modal = page.getByRole('dialog');
		await expect(modal.getByText(/are you sure/i)).toBeVisible();
		await modal.getByRole('button', { name: 'Delete' }).click();

		await expect(page.getByText(/successfully|deleted/i)).toBeVisible({ timeout: 5000 });
		await page.waitForURL(`**${result.materialHref}`, { timeout: 5000 });
		await waitForLoad(page);
	});

	test('delete a material', async ({ page }) => {
		const result = await navigateDeep(page, 'material', 'last');
		const heading = await page.locator('h1').textContent();

		await page.getByRole('button', { name: 'Delete' }).click();
		const modal = page.getByRole('dialog');
		await expect(modal.getByText(/are you sure/i)).toBeVisible();
		await modal.getByRole('button', { name: 'Delete' }).click();

		await expect(page.getByText(/successfully|deleted/i)).toBeVisible({ timeout: 5000 });
		await page.waitForURL(`**${result.brandHref}`, { timeout: 5000 });
		await waitForLoad(page);
	});

	test('delete a brand', async ({ page }) => {
		await page.goto('/brands');
		await waitForLoad(page);

		const brandLinks = await getEntityLinks(page, '/brands');
		expect(brandLinks.length).toBeGreaterThan(0);
		// Pick the last brand to minimize cascade impact
		const lastBrand = brandLinks[brandLinks.length - 1];
		await lastBrand.click();
		await waitForLoad(page);

		await page.getByRole('button', { name: 'Delete' }).click();
		const modal = page.getByRole('dialog');
		await expect(modal.getByText(/are you sure/i)).toBeVisible();
		await modal.getByRole('button', { name: 'Delete' }).click();

		await expect(page.getByText(/successfully|deleted/i)).toBeVisible({ timeout: 5000 });
		await page.waitForURL('**/brands', { timeout: 5000 });
	});

	test('delete a store', async ({ page }) => {
		await page.goto('/stores');
		await waitForLoad(page);

		const storeLinks = await getEntityLinks(page, '/stores');
		expect(storeLinks.length).toBeGreaterThan(0);
		const lastStore = storeLinks[storeLinks.length - 1];
		await lastStore.click();
		await waitForLoad(page);

		await page.getByRole('button', { name: 'Delete' }).click();
		const modal = page.getByRole('dialog');
		await expect(modal.getByText(/are you sure/i)).toBeVisible();
		await modal.getByRole('button', { name: 'Delete' }).click();

		await expect(page.getByText(/successfully|deleted/i)).toBeVisible({ timeout: 5000 });
		await page.waitForURL('**/stores', { timeout: 5000 });
	});

	// -----------------------------------------------------------------------
	// 2. UPDATE one entry at every level
	// -----------------------------------------------------------------------

	test('update a brand', async ({ page }) => {
		await page.goto('/brands');
		await waitForLoad(page);

		const brandLinks = await getEntityLinks(page, '/brands');
		expect(brandLinks.length).toBeGreaterThan(0);
		await brandLinks[0].click();
		await waitForLoad(page);

		// Click Edit
		await page.getByRole('button', { name: 'Edit' }).click();

		// Wait for modal and schema to load
		const modal = page.getByRole('dialog');
		await expect(modal).toBeVisible();

		// Modify the website field — wait for schema form to load, then use helper for UrlField
		await modal.locator('input[id="website"]').waitFor({ state: 'visible', timeout: 10000 });
		await fillUrlField(page, 'website', 'e2e-updated-brand.example.com');

		// Submit
		await modal.getByRole('button', { name: /update brand/i }).click();

		// Verify success
		await expect(page.getByText(/successfully/i)).toBeVisible({ timeout: 5000 });
	});

	test('update a store', async ({ page }) => {
		await page.goto('/stores');
		await waitForLoad(page);

		const storeLinks = await getEntityLinks(page, '/stores');
		expect(storeLinks.length).toBeGreaterThan(0);
		await storeLinks[0].click();
		await waitForLoad(page);

		await page.getByRole('button', { name: 'Edit' }).click();
		const modal = page.getByRole('dialog').filter({ hasText: /edit store/i });
		await expect(modal).toBeVisible();

		// Modify storefront URL — use helper for UrlField
		await fillUrlField(page, 'storefront_url', 'e2e-updated-store.example.com');

		await modal.getByRole('button', { name: /update store/i }).click();
		await expect(page.getByText(/successfully/i)).toBeVisible({ timeout: 5000 });
	});

	test('update a material', async ({ page }) => {
		const result = await navigateDeep(page, 'material', 'first');

		await page.getByRole('button', { name: 'Edit' }).click();
		const modal = page.getByRole('dialog').filter({ hasText: /edit material/i });
		await expect(modal).toBeVisible();

		// Modify max dry temperature
		const tempInput = modal.locator('input[id="default_max_dry_temperature"]').first();
		if (await tempInput.isVisible()) {
			await tempInput.fill('55');
		}

		await modal.getByRole('button', { name: /update material/i }).click();
		await expect(page.getByText(/successfully/i)).toBeVisible({ timeout: 5000 });
	});

	test('update a filament', async ({ page }) => {
		const result = await navigateDeep(page, 'filament', 'first');

		await page.getByRole('button', { name: 'Edit' }).click();
		const modal = page.getByRole('dialog').filter({ hasText: /edit filament/i });
		await expect(modal).toBeVisible();

		// Modify density
		const densityInput = modal.locator('input[id="density"]').first();
		if (await densityInput.isVisible()) {
			await densityInput.fill('1.30');
		}

		await modal.getByRole('button', { name: /update filament/i }).click();
		await expect(page.getByText(/successfully/i)).toBeVisible({ timeout: 5000 });
	});

	test('update a variant', async ({ page }) => {
		const result = await navigateDeep(page, 'variant', 'first');

		await page.getByRole('button', { name: 'Edit' }).click();
		const modal = page.getByRole('dialog').filter({ hasText: /edit variant/i });
		await expect(modal).toBeVisible();

		// Modify color hex
		const colorInput = modal.locator('input[id="color_hex"]').first();
		if (await colorInput.isVisible()) {
			await colorInput.fill('#FF5733');
		}

		await modal.getByRole('button', { name: /update variant/i }).click();
		await expect(page.getByText(/successfully/i)).toBeVisible({ timeout: 5000 });
	});

	// -----------------------------------------------------------------------
	// 3. ADD new child entries inside existing entities
	// -----------------------------------------------------------------------

	test('add a material to an existing brand', async ({ page }) => {
		await page.goto('/brands');
		await waitForLoad(page);

		const brandLinks = await getEntityLinks(page, '/brands');
		expect(brandLinks.length).toBeGreaterThan(0);
		await brandLinks[0].click();
		await waitForLoad(page);

		// Click "Add Material"
		await page.getByRole('button', { name: /add material/i }).click();

		// Modal should appear with material form
		const modal = page.getByRole('dialog').filter({ hasText: /create new material/i });
		await expect(modal).toBeVisible();

		// Select a material type from the dropdown
		const materialSelect = modal.locator('select').first();
		await materialSelect.waitFor({ state: 'visible' });
		// Wait for options to load
		await page.waitForTimeout(1000);
		// Pick the first available option that isn't "Select..."
		const options = await materialSelect.locator('option').all();
		let selectedValue = '';
		for (const opt of options) {
			const val = await opt.getAttribute('value');
			if (val && val !== '') {
				selectedValue = val;
				break;
			}
		}
		expect(selectedValue).not.toBe('');
		await materialSelect.selectOption(selectedValue);

		// Submit — the create redirects to the new material page (success message may not persist across navigation)
		await modal.getByRole('button', { name: /create material/i }).click();
		await page.waitForURL(/\/brands\/[^/]+\/[^/]+$/, { timeout: 10000 });
		await waitForLoad(page);
		// Verify we're on a material detail page
		await expect(page.getByRole('button', { name: /add filament/i })).toBeVisible({ timeout: 10000 });
	});

	test('add a filament to an existing material', async ({ page }) => {
		const result = await navigateDeep(page, 'material', 'first');

		await page.getByRole('button', { name: /add filament/i }).click();

		const modal = page.getByRole('dialog').filter({ hasText: /create new filament/i });
		await expect(modal).toBeVisible();

		// Wait for schema to load
		await page.waitForTimeout(1000);

		// Fill required fields: name, density, diameter_tolerance
		await modal.locator('input[id="name"]').fill(TEST_ADD_FILAMENT_NAME);
		await modal.locator('input[id="density"]').fill('1.24');
		await modal.locator('input[id="diameter_tolerance"]').fill('0.02');

		await modal.getByRole('button', { name: /create filament/i }).click();
		await page.waitForURL(/\/brands\/[^/]+\/[^/]+\/[^/]+$/, { timeout: 10000 });
		await waitForLoad(page);
		// Verify we're on a filament detail page
		await expect(page.getByRole('button', { name: /add variant/i })).toBeVisible({ timeout: 10000 });
	});

	test('add a variant to an existing filament', async ({ page }) => {
		const result = await navigateDeep(page, 'filament', 'first');

		await page.getByRole('button', { name: /add variant/i }).click();

		const modal = page.getByRole('dialog').filter({ hasText: /create new variant/i });
		await expect(modal).toBeVisible();

		// Wait for schema to load
		await page.waitForTimeout(1000);

		// Fill required fields: name, color_hex
		await modal.locator('input[id="name"]').fill(TEST_ADD_VARIANT_NAME);
		await modal.locator('input[id="color_hex"]').fill('#00FF00');

		// Fill size weight — SizeCard uses id "size-{id}-weight" where id=1 for first size
		await modal.locator('input[id="size-1-weight"]').fill('1000');

		await modal.getByRole('button', { name: /create variant/i }).click();
		await page.waitForURL(/\/brands\/[^/]+\/[^/]+\/[^/]+\/[^/]+$/, { timeout: 10000 });
		await waitForLoad(page);
		// Verify we're on a variant detail page
		await expect(page.locator('h1')).toContainText(TEST_ADD_VARIANT_NAME);
	});

	// -----------------------------------------------------------------------
	// 4. CREATE full tree from scratch (single test — local mode changes are
	//    in-memory/localStorage only, so we must stay on one page session)
	// -----------------------------------------------------------------------

	test('create a full brand tree with logo (brand → material → filament → variant)', async ({ page }) => {
		// --- Create Brand ---
		await page.goto('/brands');
		await waitForLoad(page);

		await page.getByRole('button', { name: /add brand/i }).click();

		let modal = page.getByRole('dialog').filter({ hasText: /create new brand/i });
		await expect(modal).toBeVisible();
		await modal.locator('input[id="name"]').waitFor({ state: 'visible', timeout: 10000 });

		// Upload logo
		const brandFileInput = modal.locator('input[type="file"]');
		await brandFileInput.setInputFiles(LOGO_PATH);
		const applyCrop = page.getByRole('button', { name: /apply crop/i });
		await applyCrop.waitFor({ state: 'visible', timeout: 5000 });
		await applyCrop.click();
		await page.waitForTimeout(500);

		await modal.locator('input[id="name"]').fill(TEST_BRAND_NAME);
		await fillUrlField(page, 'website', 'e2e-test-brand.example.com');

		await modal.getByRole('button', { name: /create brand/i }).click();
		await page.waitForURL(/\/brands\/[^/]+$/, { timeout: 10000 });
		await waitForLoad(page);
		await expect(page.locator('h1')).toContainText(TEST_BRAND_NAME);

		// --- Create Material inside the new brand ---
		await page.getByRole('button', { name: /add material/i }).waitFor({ state: 'visible', timeout: 15000 });
		await page.getByRole('button', { name: /add material/i }).click();

		modal = page.getByRole('dialog').filter({ hasText: /create new material/i });
		await expect(modal).toBeVisible();
		const materialSelect = modal.locator('select').first();
		await materialSelect.waitFor({ state: 'visible' });
		await page.waitForTimeout(1000);
		await materialSelect.selectOption('PLA');

		await modal.getByRole('button', { name: /create material/i }).click();
		await page.waitForURL(/\/brands\/[^/]+\/[^/]+$/, { timeout: 10000 });
		await waitForLoad(page);
		await expect(page.locator('h1')).toContainText('PLA');

		// --- Create Filament inside the new material ---
		await page.getByRole('button', { name: /add filament/i }).waitFor({ state: 'visible', timeout: 15000 });
		await page.getByRole('button', { name: /add filament/i }).click();

		modal = page.getByRole('dialog').filter({ hasText: /create new filament/i });
		await expect(modal).toBeVisible();
		await page.waitForTimeout(1000);

		await modal.locator('input[id="name"]').fill(TEST_FILAMENT_NAME);
		await modal.locator('input[id="density"]').fill('1.24');
		await modal.locator('input[id="diameter_tolerance"]').fill('0.02');

		await modal.getByRole('button', { name: /create filament/i }).click();
		await page.waitForURL(/\/brands\/[^/]+\/[^/]+\/[^/]+$/, { timeout: 10000 });
		await waitForLoad(page);
		await expect(page.locator('h1')).toContainText(TEST_FILAMENT_NAME);

		// --- Create Variant inside the new filament ---
		await page.getByRole('button', { name: /add variant/i }).waitFor({ state: 'visible', timeout: 15000 });
		await page.getByRole('button', { name: /add variant/i }).click();

		modal = page.getByRole('dialog').filter({ hasText: /create new variant/i });
		await expect(modal).toBeVisible();
		await page.waitForTimeout(1000);

		await modal.locator('input[id="name"]').fill(TEST_VARIANT_NAME);
		await modal.locator('input[id="color_hex"]').fill('#000000');
		await modal.locator('input[id="size-1-weight"]').fill('1000');

		await modal.getByRole('button', { name: /create variant/i }).click();
		await page.waitForURL(/\/brands\/[^/]+\/[^/]+\/[^/]+\/[^/]+$/, { timeout: 10000 });
		await waitForLoad(page);
		await expect(page.locator('h1')).toContainText(TEST_VARIANT_NAME);
	});

	// -----------------------------------------------------------------------
	// 5. CREATE a new store
	// -----------------------------------------------------------------------

	test('create a new store with logo', async ({ page }) => {
		await page.goto('/stores');
		await waitForLoad(page);

		await page.getByRole('button', { name: /add store/i }).click();

		const modal = page.getByRole('dialog').filter({ hasText: /create new store/i });
		await expect(modal).toBeVisible();
		await modal.locator('input[id="name"]').waitFor({ state: 'visible', timeout: 10000 });

		// Upload logo
		const fileInput = modal.locator('input[type="file"]');
		await fileInput.setInputFiles(LOGO_PATH);
		const applyCrop = page.getByRole('button', { name: /apply crop/i });
		await applyCrop.waitFor({ state: 'visible', timeout: 5000 });
		await applyCrop.click();
		await page.waitForTimeout(500);

		await modal.locator('input[id="name"]').fill(TEST_STORE_NAME);
		await fillUrlField(page, 'storefront_url', 'e2e-test-store.example.com');

		await modal.getByRole('button', { name: /create store/i }).click();
		await page.waitForURL(/\/stores\/[^/]+$/, { timeout: 10000 });
		await waitForLoad(page);
		await expect(page.locator('h1')).toContainText(TEST_STORE_NAME);
	});

	// Note: No cleanup needed. In local mode, CRUD operations only track changes
	// in-memory and localStorage — nothing is written to disk until the user
	// explicitly clicks "Save to Disk" in the changes menu.
});
