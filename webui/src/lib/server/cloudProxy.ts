import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/public';

export const IS_CLOUD = env.PUBLIC_APP_MODE === 'cloud';
export const IS_LOCAL = env.PUBLIC_APP_MODE !== 'cloud';

export const API_BASE = env.PUBLIC_API_BASE_URL
	? env.PUBLIC_API_BASE_URL.endsWith('/')
		? env.PUBLIC_API_BASE_URL.slice(0, -1)
		: env.PUBLIC_API_BASE_URL
	: 'https://api.openfilamentdatabase.org';

/**
 * Build the dataset API URL from a local API path.
 * Maps local paths like /api/brands to cloud paths like /api/v1/brands/index.json
 */
function buildCloudUrl(localPath: string): string {
	// Stores
	if (localPath.startsWith('/api/stores')) {
		const match = localPath.match(/^\/api\/stores\/([^/]+)$/);
		if (match) {
			return `${API_BASE}/api/v1/stores/${match[1]}.json`;
		}
		if (localPath === '/api/stores') {
			return `${API_BASE}/api/v1/stores/index.json`;
		}
	}

	// Brands
	if (localPath.startsWith('/api/brands')) {
		if (localPath === '/api/brands') {
			return `${API_BASE}/api/v1/brands/index.json`;
		}

		const match = localPath.match(/^\/api\/brands\/([^/]+)(?:\/(.+))?$/);
		if (match) {
			const brandId = match[1];
			const subPath = match[2];

			if (!subPath) {
				return `${API_BASE}/api/v1/brands/${brandId}/index.json`;
			}

			if (subPath === 'materials') {
				// Materials are included in the brand response
				return `${API_BASE}/api/v1/brands/${brandId}/index.json`;
			}

			const materialMatch = subPath.match(
				/^materials\/([^/]+)(?:\/filaments(?:\/([^/]+)(?:\/variants(?:\/([^/]+))?)?)?)?$/
			);
			if (materialMatch) {
				const materialType = materialMatch[1];
				const filamentName = materialMatch[2];
				const variantId = materialMatch[3];

				const isVariantsList = subPath.includes('/variants') && !variantId;

				if (variantId) {
					return `${API_BASE}/api/v1/brands/${brandId}/materials/${materialType}/filaments/${filamentName}/variants/${variantId}.json`;
				} else if (isVariantsList && filamentName) {
					return `${API_BASE}/api/v1/brands/${brandId}/materials/${materialType}/filaments/${filamentName}/index.json`;
				} else if (filamentName) {
					return `${API_BASE}/api/v1/brands/${brandId}/materials/${materialType}/filaments/${filamentName}/index.json`;
				} else {
					return `${API_BASE}/api/v1/brands/${brandId}/materials/${materialType}/index.json`;
				}
			}
		}
	}

	// Schemas
	if (localPath.startsWith('/api/schemas')) {
		const match = localPath.match(/^\/api\/schemas\/([^/]+)$/);
		if (match) {
			return `${API_BASE}/api/v1/schemas/${match[1]}_schema.json`;
		}
		return `${API_BASE}/api/v1/schemas/index.json`;
	}

	// Fallback
	return `${API_BASE}${localPath}`;
}

/**
 * Transform cloud API response to match local API structure.
 * Cloud API wraps arrays in objects: { brands: [...] }
 * Local API returns plain arrays: [...]
 */
function transformCloudResponse(data: any, localPath: string): any {
	// Stores index: { stores: [...] } -> [...]
	if (localPath === '/api/stores') {
		if (data && typeof data === 'object' && 'stores' in data) {
			return data.stores.map((store: any) => ({
				...store,
				logo: store.logo_slug || store.logo
			}));
		}
	}

	// Brands index: { brands: [...] } -> [...]
	if (localPath === '/api/brands') {
		if (data && typeof data === 'object' && 'brands' in data) {
			return data.brands.map((brand: any) => ({
				...brand,
				logo: brand.logo_slug || brand.logo
			}));
		}
	}

	// Materials list: extract materials array from brand response
	const materialsMatch = localPath.match(/^\/api\/brands\/([^/]+)\/materials$/);
	if (materialsMatch && data && typeof data === 'object' && 'materials' in data) {
		return data.materials;
	}

	// Filaments list: extract filaments array from material response
	const filamentsMatch = localPath.match(
		/^\/api\/brands\/([^/]+)\/materials\/([^/]+)\/filaments$/
	);
	if (filamentsMatch && data && typeof data === 'object' && 'filaments' in data) {
		return data.filaments;
	}

	// Variants list: extract variants array from filament response
	const variantsMatch = localPath.match(
		/^\/api\/brands\/([^/]+)\/materials\/([^/]+)\/filaments\/([^/]+)\/variants$/
	);
	if (variantsMatch && data && typeof data === 'object' && 'variants' in data) {
		return data.variants;
	}

	// Individual entity: map logo_slug -> logo
	if (data && typeof data === 'object' && 'logo_slug' in data) {
		return {
			...data,
			logo: data.logo_slug || data.logo
		};
	}

	return data;
}

/**
 * Proxy a GET request to the cloud dataset API and return a transformed response.
 * Use this in +server.ts GET handlers when IS_CLOUD is true.
 */
export async function proxyGetToCloud(localPath: string): Promise<Response> {
	const cloudUrl = buildCloudUrl(localPath);

	try {
		const response = await fetch(cloudUrl);
		if (!response.ok) {
			return json(
				{ error: `Cloud API returned ${response.status}` },
				{ status: response.status }
			);
		}

		const data = await response.json();
		const transformed = transformCloudResponse(data, localPath);
		return json(transformed);
	} catch (error) {
		console.error(`Cloud proxy error for ${localPath}:`, error);
		return json({ error: 'Failed to fetch from cloud API' }, { status: 502 });
	}
}

/**
 * Proxy a logo request to the cloud dataset API.
 * Returns the raw image response (not JSON).
 */
export async function proxyLogoToCloud(
	entityType: 'brand' | 'store',
	entityId: string,
	filename: string
): Promise<Response> {
	const cloudUrl = `${API_BASE}/api/v1/${entityType}s/logo/${filename}`;

	try {
		const response = await fetch(cloudUrl);
		if (!response.ok) {
			return new Response('Logo not found', { status: 404 });
		}

		const contentType = response.headers.get('content-type') || 'image/png';
		const body = await response.arrayBuffer();

		return new Response(body, {
			status: 200,
			headers: { 'Content-Type': contentType }
		});
	} catch (error) {
		console.error(`Cloud logo proxy error for ${entityType}/${entityId}/${filename}:`, error);
		return new Response('Failed to fetch logo', { status: 502 });
	}
}
