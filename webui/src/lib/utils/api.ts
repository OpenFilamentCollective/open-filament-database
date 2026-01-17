import { get } from 'svelte/store';
import { isLocalMode, apiBaseUrl, isCloudMode } from '$lib/stores/environment';

/**
 * Build the appropriate API URL based on environment mode
 * In local mode: uses relative paths (/api/...)
 * In cloud mode: uses external API with /api/v1/... structure
 *
 * @param path - The API path (e.g., '/api/stores', '/api/brands/acme')
 * @returns The full URL to use for the API call
 */
export function buildApiUrl(path: string): string {
	const baseUrl = get(apiBaseUrl);

	if (get(isLocalMode)) {
		// Local mode uses relative paths to local API endpoints
		return path;
	}

	// Cloud mode uses external API with /api/v1/ prefix
	// Map local API paths to cloud API paths

	// Handle stores endpoints
	if (path.startsWith('/api/stores')) {
		// /api/stores -> /api/v1/stores/index.json
		// /api/stores/[id] -> /api/v1/stores/[id].json
		const match = path.match(/^\/api\/stores\/([^/]+)$/);
		if (match) {
			const storeId = match[1];
			return `${baseUrl}/api/v1/stores/${storeId}.json`;
		}
		if (path === '/api/stores') {
			return `${baseUrl}/api/v1/stores/index.json`;
		}
		// Handle logo endpoints (not available in cloud API - return as-is for local handling)
		if (path.includes('/logo')) {
			return path;
		}
	}

	// Handle brands endpoints
	if (path.startsWith('/api/brands')) {
		// /api/brands -> /api/v1/brands/index.json
		// /api/brands/[id] -> /api/v1/brands/[id]/index.json
		// /api/brands/[id]/materials -> /api/v1/brands/[id]/index.json (materials are in the same response)
		// /api/brands/[id]/materials/[type] -> /api/v1/brands/[id]/materials/[type]/index.json
		// /api/brands/[id]/materials/[type]/filaments -> /api/v1/brands/[id]/materials/[type]/index.json
		// /api/brands/[id]/materials/[type]/filaments/[filament] -> /api/v1/brands/[id]/materials/[type]/filaments/[filament]/index.json
		// /api/brands/[id]/materials/[type]/filaments/[filament]/variants/[variant] -> /api/v1/brands/[id]/materials/[type]/filaments/[filament]/variants/[variant].json

		// Handle logo endpoints (not available in cloud API - return as-is for local handling)
		if (path.includes('/logo')) {
			return path;
		}

		// Parse the path to build the cloud API URL
		const match = path.match(/^\/api\/brands\/([^/]+)(?:\/(.+))?$/);
		if (match) {
			const brandId = match[1];
			const subPath = match[2];

			if (!subPath) {
				// /api/brands/[id]
				return `${baseUrl}/api/v1/brands/${brandId}/index.json`;
			}

			if (subPath === 'materials') {
				// In cloud API, materials are included in the brand response
				// /api/brands/[id]/materials -> /api/v1/brands/[id]/index.json
				return `${baseUrl}/api/v1/brands/${brandId}/index.json`;
			}

			// Handle materials, filaments, and variants paths
			const materialMatch = subPath.match(
				/^materials\/([^/]+)(?:\/filaments(?:\/([^/]+)(?:\/variants(?:\/([^/]+))?)?)?)?$/
			);
			if (materialMatch) {
				const materialType = materialMatch[1];
				const filamentName = materialMatch[2];
				const variantId = materialMatch[3];

				// Check if the path ends with /variants (list of variants)
				const isVariantsList = subPath.includes('/variants') && !variantId;

				if (variantId) {
					// /api/brands/[id]/materials/[type]/filaments/[filament]/variants/[variant]
					return `${baseUrl}/api/v1/brands/${brandId}/materials/${materialType}/filaments/${filamentName}/variants/${variantId}.json`;
				} else if (isVariantsList && filamentName) {
					// /api/brands/[id]/materials/[type]/filaments/[filament]/variants
					// Maps to filament endpoint which includes variants
					return `${baseUrl}/api/v1/brands/${brandId}/materials/${materialType}/filaments/${filamentName}/index.json`;
				} else if (filamentName) {
					// /api/brands/[id]/materials/[type]/filaments/[filament]
					return `${baseUrl}/api/v1/brands/${brandId}/materials/${materialType}/filaments/${filamentName}/index.json`;
				} else {
					// /api/brands/[id]/materials/[type] or /api/brands/[id]/materials/[type]/filaments
					// Both map to the material endpoint which includes filaments
					return `${baseUrl}/api/v1/brands/${brandId}/materials/${materialType}/index.json`;
				}
			}
		}

		if (path === '/api/brands') {
			return `${baseUrl}/api/v1/brands/index.json`;
		}
	}

	// Handle schemas endpoints
	if (path.startsWith('/api/schemas')) {
		// /api/schemas/[type] -> /api/v1/schemas/[type]_schema.json
		const match = path.match(/^\/api\/schemas\/([^/]+)$/);
		if (match) {
			const schemaType = match[1];
			return `${baseUrl}/api/v1/schemas/${schemaType}_schema.json`;
		}
		// /api/schemas -> /api/v1/schemas/index.json
		return `${baseUrl}/api/v1/schemas/index.json`;
	}

	// Default: append path to base URL (for any custom endpoints)
	return `${baseUrl}${path}`;
}

/**
 * Transform cloud API response to match local API structure
 * Cloud API returns: { version, generated_at, count, stores/brands: [...] }
 * Local API returns: [...]
 *
 * @param data - The response data from the API
 * @param path - The original request path
 * @returns Normalized data matching local API structure
 */
function transformCloudResponse(data: any, path: string): any {
	const isCloud = get(isLocalMode) === false;

	if (!isCloud) {
		// Local mode - return as-is
		return data;
	}

	// Cloud mode transformations
	// 1. Transform stores index response
	if (path === '/api/stores' || path.match(/^\/api\/stores$/)) {
		if (data && typeof data === 'object' && 'stores' in data) {
			// Map logo_slug to logo for consistency with local API
			return data.stores.map((store: any) => ({
				...store,
				logo: store.logo_slug || store.logo
			}));
		}
	}

	// 2. Transform brands index response
	if (path === '/api/brands' || path.match(/^\/api\/brands$/)) {
		if (data && typeof data === 'object' && 'brands' in data) {
			// Map logo_slug to logo for consistency with local API
			return data.brands.map((brand: any) => ({
				...brand,
				logo: brand.logo_slug || brand.logo
			}));
		}
	}

	// 3. Transform brand materials endpoint
	// Local: /api/brands/[id]/materials returns array of materials
	// Cloud: /api/brands/[id]/index.json returns brand object with materials array inside
	const materialsMatch = path.match(/^\/api\/brands\/([^/]+)\/materials$/);
	if (materialsMatch && data && typeof data === 'object' && 'materials' in data) {
		// Extract materials array from brand object
		return data.materials;
	}

	// 4. Transform material filaments endpoint
	// Local: /api/brands/[id]/materials/[type]/filaments returns array of filaments
	// Cloud: /api/brands/[id]/materials/[type]/index.json returns material object with filaments array inside
	const filamentsMatch = path.match(/^\/api\/brands\/([^/]+)\/materials\/([^/]+)\/filaments$/);
	if (filamentsMatch && data && typeof data === 'object' && 'filaments' in data) {
		// Extract filaments array from material object
		return data.filaments;
	}

	// 5. Transform filament variants endpoint
	// Local: /api/brands/[id]/materials/[type]/filaments/[filament]/variants returns array of variants
	// Cloud: /api/brands/[id]/materials/[type]/filaments/[filament]/index.json returns filament object with variants array inside
	const variantsMatch = path.match(
		/^\/api\/brands\/([^/]+)\/materials\/([^/]+)\/filaments\/([^/]+)\/variants$/
	);
	if (variantsMatch && data && typeof data === 'object' && 'variants' in data) {
		// Extract variants array from filament object
		return data.variants;
	}

	// 6. Transform individual store/brand responses to map logo_slug to logo
	// This handles /api/brands/[id] and /api/stores/[id] endpoints
	if (data && typeof data === 'object' && 'logo_slug' in data) {
		return {
			...data,
			logo: data.logo_slug || data.logo
		};
	}

	// For other endpoints, return as-is
	// The cloud API structure matches local API for these
	return data;
}

/**
 * Fetch data from an API endpoint with automatic URL building and response transformation
 * Wraps the standard fetch API with environment-aware URL building and data normalization
 *
 * @param path - The API path (e.g., '/api/stores')
 * @param options - Standard fetch options
 * @returns Promise with the fetch Response
 */
export async function apiFetch(path: string, options?: RequestInit): Promise<Response> {
	const url = buildApiUrl(path);
	const response = await fetch(url, options);

	// Only transform GET requests (not PUT, POST, DELETE)
	const method = options?.method?.toUpperCase() || 'GET';
	if (method !== 'GET' || !response.ok) {
		return response;
	}

	// Clone the response to read it without consuming the original
	const clonedResponse = response.clone();

	try {
		const data = await response.json();
		const transformedData = transformCloudResponse(data, path);

		// Create a new response with transformed data
		return new Response(JSON.stringify(transformedData), {
			status: clonedResponse.status,
			statusText: clonedResponse.statusText,
			headers: clonedResponse.headers
		});
	} catch (error) {
		// If JSON parsing fails, return the original response
		return clonedResponse;
	}
}
