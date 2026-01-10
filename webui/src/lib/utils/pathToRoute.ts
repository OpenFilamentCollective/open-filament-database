/**
 * Convert file paths from validation errors to SvelteKit routes
 *
 * Example paths:
 * - data/bambu_lab/PLA/basic_pla/white/variant.json -> /Brand/bambu_lab/PLA/basic_pla/white
 * - stores/amazon/store.json -> /Store/amazon
 */
export function pathToRoute(filePath: string): string {
	// Normalize path separators
	const normalizedPath = filePath.replace(/\\/g, '/');
	const parts = normalizedPath.split('/');

	// Handle stores directory
	if (normalizedPath.startsWith('stores/')) {
		// stores/store_name/store.json -> /Store/store_name
		if (parts.length >= 2) {
			return `/Store/${parts[1]}`;
		}
	}

	// Handle data directory hierarchy
	if (normalizedPath.startsWith('data/')) {
		const [_, brandId, materialId, filamentId, variantId, filename] = parts;

		// Brand level (data/brandId/brand.json)
		if (filename === 'brand.json' || parts.length === 3) {
			return `/Brand/${brandId}`;
		}

		// Material level (data/brandId/materialId/material.json)
		if (filename === 'material.json' || parts.length === 4) {
			return `/Brand/${brandId}/${materialId}`;
		}

		// Filament level (data/brandId/materialId/filamentId/filament.json)
		if (filename === 'filament.json' || parts.length === 5) {
			return `/Brand/${brandId}/${materialId}/${filamentId}`;
		}

		// Variant level (data/brandId/materialId/filamentId/variantId/variant.json or sizes.json)
		if (filename === 'variant.json' || filename === 'sizes.json' || parts.length === 6) {
			return `/Brand/${brandId}/${materialId}/${filamentId}/${variantId}`;
		}
	}

	// Fallback to home if path doesn't match expected structure
	return '/';
}
