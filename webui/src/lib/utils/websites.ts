/**
 * A brand's sites, main site first. In brand.json `website` is one URL or a list; the built
 * dataset keeps the main site in `website` and the full list in `websites`.
 */
export function websiteList(brand: { website?: unknown; websites?: unknown } | null | undefined): string[] {
	const value = brand?.websites ?? brand?.website;
	const urls = Array.isArray(value) ? value : [value];
	return urls.filter((url): url is string => typeof url === 'string' && url !== '');
}
