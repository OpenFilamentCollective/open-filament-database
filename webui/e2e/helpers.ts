import type { Page } from '@playwright/test';

/**
 * Get links to individual entity detail pages, excluding the list page link itself.
 * E.g., for "brands": matches /brands/some-brand but not /brands
 */
export function getDetailLinks(page: Page, entity: 'brands' | 'stores') {
	return page.locator(`a[href^="/${entity}/"]`).filter({ hasNot: page.locator(`[href="/${entity}"]`) });
}
