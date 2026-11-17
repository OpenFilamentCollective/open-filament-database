/**
 * Contract tests for cloudProxy.
 *
 * Cloud and local responses have different shapes (cloud returns UUIDs,
 * envelopes arrays in objects, etc.). cloudProxy is responsible for
 * normalizing them to match the local on-disk JSON shape. The CLAUDE.md
 * memory `project_cloud_api_shape.md` calls this out as a recurring
 * breakage point — these tests pin the contract.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { proxyGetToCloud, proxyLogoToCloud, API_BASE } from '../cloudProxy';

// Helper to build a mocked fetch response
function jsonResponse(body: any, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

function errorResponse(status: number): Response {
	return new Response('error', { status });
}

function imageResponse(contentType = 'image/png'): Response {
	const data = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
	return new Response(data, {
		status: 200,
		headers: { 'Content-Type': contentType }
	});
}

describe('cloudProxy', () => {
	const fetchMock = vi.fn();

	beforeEach(() => {
		fetchMock.mockReset();
		vi.stubGlobal('fetch', fetchMock);
	});

	describe('API_BASE', () => {
		it('defaults to the production cloud URL', () => {
			expect(API_BASE).toBe('https://api.openfilamentdatabase.org');
		});
	});

	describe('URL mapping', () => {
		it('maps /api/brands to the cloud brands index', async () => {
			fetchMock.mockResolvedValueOnce(jsonResponse({ brands: [] }));
			await proxyGetToCloud('/api/brands');
			expect(fetchMock).toHaveBeenCalledWith(`${API_BASE}/api/v1/brands/index.json`);
		});

		it('maps /api/brands/:id to the brand index.json', async () => {
			fetchMock.mockResolvedValueOnce(jsonResponse({ id: 'acme' }));
			await proxyGetToCloud('/api/brands/acme');
			expect(fetchMock).toHaveBeenCalledWith(`${API_BASE}/api/v1/brands/acme/index.json`);
		});

		it('maps /api/brands/:id/materials to the brand index (materials are embedded)', async () => {
			fetchMock.mockResolvedValueOnce(jsonResponse({ materials: [] }));
			await proxyGetToCloud('/api/brands/acme/materials');
			expect(fetchMock).toHaveBeenCalledWith(`${API_BASE}/api/v1/brands/acme/index.json`);
		});

		it('maps /api/brands/:id/materials/:type to a material index.json (uppercases material)', async () => {
			fetchMock.mockResolvedValueOnce(jsonResponse({ filaments: [] }));
			await proxyGetToCloud('/api/brands/acme/materials/pla');
			expect(fetchMock).toHaveBeenCalledWith(
				`${API_BASE}/api/v1/brands/acme/materials/PLA/index.json`
			);
		});

		it('maps a filament path to filament index.json', async () => {
			fetchMock.mockResolvedValueOnce(jsonResponse({ variants: [] }));
			await proxyGetToCloud('/api/brands/acme/materials/pla/filaments/basic');
			expect(fetchMock).toHaveBeenCalledWith(
				`${API_BASE}/api/v1/brands/acme/materials/PLA/filaments/basic/index.json`
			);
		});

		it('maps a variant detail path to variant <id>.json', async () => {
			// Omit `sizes` so normalizeCloudVariant doesn't trigger a second fetch
			fetchMock.mockResolvedValueOnce(jsonResponse({ id: 'red' }));
			await proxyGetToCloud('/api/brands/acme/materials/pla/filaments/basic/variants/red');
			expect(fetchMock).toHaveBeenCalledWith(
				`${API_BASE}/api/v1/brands/acme/materials/PLA/filaments/basic/variants/red.json`
			);
		});

		it('maps /api/stores to the stores index', async () => {
			fetchMock.mockResolvedValueOnce(jsonResponse({ stores: [] }));
			await proxyGetToCloud('/api/stores');
			expect(fetchMock).toHaveBeenCalledWith(`${API_BASE}/api/v1/stores/index.json`);
		});

		it('maps /api/stores/:id to the store JSON', async () => {
			fetchMock.mockResolvedValueOnce(jsonResponse({ id: 'shop' }));
			await proxyGetToCloud('/api/stores/shop');
			expect(fetchMock).toHaveBeenCalledWith(`${API_BASE}/api/v1/stores/shop.json`);
		});

		it('maps /api/schemas/:name to the schema file', async () => {
			fetchMock.mockResolvedValueOnce(jsonResponse({}));
			await proxyGetToCloud('/api/schemas/brand');
			expect(fetchMock).toHaveBeenCalledWith(`${API_BASE}/api/v1/schemas/brand_schema.json`);
		});

		it('falls back to API_BASE + path for unmapped routes', async () => {
			fetchMock.mockResolvedValueOnce(jsonResponse({}));
			await proxyGetToCloud('/api/something/else');
			expect(fetchMock).toHaveBeenCalledWith(`${API_BASE}/api/something/else`);
		});
	});

	describe('Response normalization', () => {
		it('unwraps { brands: [...] } to a plain array and aliases logo_slug→logo', async () => {
			fetchMock.mockResolvedValueOnce(
				jsonResponse({
					brands: [
						{ id: 'acme', name: 'Acme', logo_slug: 'acme.png' },
						{ id: 'foo', name: 'Foo', logo: 'foo.png' }
					]
				})
			);

			const response = await proxyGetToCloud('/api/brands');
			expect(response.status).toBe(200);
			const data = await response.json();
			expect(Array.isArray(data)).toBe(true);
			expect(data).toHaveLength(2);
			expect(data[0].logo).toBe('acme.png');
			expect(data[1].logo).toBe('foo.png');
		});

		it('unwraps { stores: [...] } to a plain array', async () => {
			fetchMock.mockResolvedValueOnce(
				jsonResponse({
					stores: [{ id: 'shop', name: 'Shop', logo_slug: 'shop.svg' }]
				})
			);

			const response = await proxyGetToCloud('/api/stores');
			const data = await response.json();
			expect(Array.isArray(data)).toBe(true);
			expect(data[0].logo).toBe('shop.svg');
		});

		it('aliases logo_slug→logo on individual entity responses', async () => {
			fetchMock.mockResolvedValueOnce(
				jsonResponse({ id: 'acme', name: 'Acme', logo_slug: 'acme.png' })
			);
			const response = await proxyGetToCloud('/api/brands/acme');
			const data = await response.json();
			expect(data.logo).toBe('acme.png');
		});

		it('extracts materials array from brand index for /materials', async () => {
			fetchMock.mockResolvedValueOnce(
				jsonResponse({
					id: 'acme',
					materials: [{ id: 'pla', material: 'PLA' }]
				})
			);
			const response = await proxyGetToCloud('/api/brands/acme/materials');
			const data = await response.json();
			expect(Array.isArray(data)).toBe(true);
			expect(data[0].material).toBe('PLA');
		});

		it('extracts filaments array from material response', async () => {
			fetchMock.mockResolvedValueOnce(
				jsonResponse({
					id: 'pla',
					filaments: [{ id: 'basic', name: 'Basic PLA' }]
				})
			);
			const response = await proxyGetToCloud('/api/brands/acme/materials/pla/filaments');
			const data = await response.json();
			expect(Array.isArray(data)).toBe(true);
			expect(data[0].name).toBe('Basic PLA');
		});

		it('extracts variants array from filament response', async () => {
			fetchMock.mockResolvedValueOnce(
				jsonResponse({
					id: 'basic',
					variants: [{ id: 'red', color_name: 'Red' }]
				})
			);
			const response = await proxyGetToCloud(
				'/api/brands/acme/materials/pla/filaments/basic/variants'
			);
			const data = await response.json();
			expect(Array.isArray(data)).toBe(true);
			expect(data[0].color_name).toBe('Red');
		});
	});

	// The dataset keys entities by a deterministic UUIDv5 `id` and carries the
	// human-readable folder name in `slug`. The client builds submission folder
	// paths from `id`, so the proxy must collapse `id` onto `slug` for every
	// entity shape — otherwise a UUID leaks into a PR as data/<uuid>/... (this is
	// how the orphaned `data/1d35f140_..._9c6` = uuid5("sunlu") folder was made).
	describe('Entity id→slug normalization (prevents UUID folder leaks)', () => {
		it('aligns brand id with slug in the brands index', async () => {
			fetchMock.mockResolvedValueOnce(
				jsonResponse({
					brands: [{ id: '1d35f140-7cba-5fa4-9bb6-9e3eb2fd95c6', slug: 'sunlu', name: 'Sunlu' }]
				})
			);
			const response = await proxyGetToCloud('/api/brands');
			const data = await response.json();
			expect(data[0].id).toBe('sunlu');
		});

		it('aligns brand id with slug on an individual brand response', async () => {
			fetchMock.mockResolvedValueOnce(
				jsonResponse({
					id: '1d35f140-7cba-5fa4-9bb6-9e3eb2fd95c6',
					slug: 'sunlu',
					name: 'Sunlu',
					logo_slug: 'sunlu.png'
				})
			);
			const response = await proxyGetToCloud('/api/brands/sunlu');
			const data = await response.json();
			expect(data.id).toBe('sunlu');
			expect(data.logo).toBe('sunlu.png');
		});

		it('aligns filament id with slug in the filaments list', async () => {
			fetchMock.mockResolvedValueOnce(
				jsonResponse({
					filaments: [{ id: 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d', slug: 'pla+', name: 'PLA+' }]
				})
			);
			const response = await proxyGetToCloud('/api/brands/sunlu/materials/pla/filaments');
			const data = await response.json();
			expect(data[0].id).toBe('pla+');
		});

		it('aligns variant id with slug in the variants list', async () => {
			fetchMock.mockResolvedValueOnce(
				jsonResponse({
					variants: [
						{ id: 'b2c3d4e5-f6a7-5b6c-9d0e-1f2a3b4c5d6e', slug: 'grassgreen', color_name: 'Grass Green' }
					]
				})
			);
			const response = await proxyGetToCloud(
				'/api/brands/sunlu/materials/pla/filaments/pla+/variants'
			);
			const data = await response.json();
			expect(data[0].id).toBe('grassgreen');
		});

		it('leaves id untouched when no slug is present (e.g. local-shaped data)', async () => {
			fetchMock.mockResolvedValueOnce(jsonResponse({ brands: [{ id: 'sunlu', name: 'Sunlu' }] }));
			const response = await proxyGetToCloud('/api/brands');
			const data = await response.json();
			expect(data[0].id).toBe('sunlu');
		});
	});

	describe('Variant normalization (strips UUIDs, rewrites store_id, migrates spool_refill)', () => {
		const variantPath = '/api/brands/acme/materials/pla/filaments/basic/variants/red';

		beforeEach(() => {
			fetchMock.mockImplementation((url: string) => {
				// store id→slug map is populated lazily on first variant fetch
				if (url === `${API_BASE}/api/v1/stores/index.json`) {
					return Promise.resolve(
						jsonResponse({
							stores: [
								{ id: 'uuid-shop-1', slug: 'shop-one' },
								{ id: 'uuid-shop-2', slug: 'shop-two' }
							]
						})
					);
				}
				return Promise.resolve(jsonResponse({}));
			});
		});

		it('strips id and variant_id from each size', async () => {
			fetchMock.mockImplementationOnce(() =>
				Promise.resolve(
					jsonResponse({
						id: 'uuid-variant-red',
						slug: 'red',
						color_name: 'Red',
						sizes: [
							{
								id: 'uuid-size-1',
								variant_id: 'uuid-variant-red',
								diameter: 1.75,
								weight: 1000,
								purchase_links: []
							}
						]
					})
				)
			);
			const response = await proxyGetToCloud(variantPath);
			const data = await response.json();
			expect(data.sizes[0].id).toBeUndefined();
			expect(data.sizes[0].variant_id).toBeUndefined();
			expect(data.sizes[0].diameter).toBe(1.75);
		});

		it('aligns id with slug when both are present', async () => {
			fetchMock.mockImplementationOnce(() =>
				Promise.resolve(
					jsonResponse({
						id: 'uuid-variant-red',
						slug: 'red',
						color_name: 'Red',
						sizes: []
					})
				)
			);
			const response = await proxyGetToCloud(variantPath);
			const data = await response.json();
			expect(data.id).toBe('red');
			expect(data.slug).toBe('red');
		});

		it('strips id and size_id from purchase_links and rewrites store_id UUIDs to slugs', async () => {
			fetchMock.mockImplementationOnce(() =>
				Promise.resolve(
					jsonResponse({
						id: 'uuid-variant-red',
						slug: 'red',
						sizes: [
							{
								id: 'uuid-size-1',
								variant_id: 'uuid-variant-red',
								diameter: 1.75,
								purchase_links: [
									{
										id: 'uuid-link-1',
										size_id: 'uuid-size-1',
										store_id: 'uuid-shop-1',
										url: 'https://shop.example/red'
									},
									{
										id: 'uuid-link-2',
										size_id: 'uuid-size-1',
										store_id: 'uuid-unknown',
										url: 'https://other.example/red'
									}
								]
							}
						]
					})
				)
			);
			const response = await proxyGetToCloud(variantPath);
			const data = await response.json();
			const links = data.sizes[0].purchase_links;
			expect(links[0].id).toBeUndefined();
			expect(links[0].size_id).toBeUndefined();
			expect(links[0].store_id).toBe('shop-one');
			// Unknown store UUIDs are left unchanged
			expect(links[1].store_id).toBe('uuid-unknown');
		});

		it('migrates legacy purchase_links[].spool_refill=true to size-level container_material=refill', async () => {
			fetchMock.mockImplementationOnce(() =>
				Promise.resolve(
					jsonResponse({
						id: 'uuid-variant-red',
						slug: 'red',
						sizes: [
							{
								id: 'uuid-size-1',
								diameter: 1.75,
								purchase_links: [
									{
										id: 'uuid-link-1',
										store_id: 'uuid-shop-1',
										spool_refill: true,
										url: 'https://shop.example/red'
									}
								]
							}
						]
					})
				)
			);
			const response = await proxyGetToCloud(variantPath);
			const data = await response.json();
			expect(data.sizes[0].container_material).toBe('refill');
			expect(data.sizes[0].spool_refill).toBeUndefined();
			expect(data.sizes[0].purchase_links[0].spool_refill).toBeUndefined();
		});

		it('leaves container_material unset when no legacy refill field is present', async () => {
			fetchMock.mockImplementationOnce(() =>
				Promise.resolve(
					jsonResponse({
						id: 'uuid-variant-red',
						slug: 'red',
						sizes: [
							{
								id: 'uuid-size-1',
								diameter: 1.75,
								purchase_links: []
							}
						]
					})
				)
			);
			const response = await proxyGetToCloud(variantPath);
			const data = await response.json();
			expect(data.sizes[0].container_material).toBeUndefined();
		});

		it('defaults discontinued to false when not provided', async () => {
			fetchMock.mockImplementationOnce(() =>
				Promise.resolve(
					jsonResponse({
						id: 'uuid-variant-red',
						slug: 'red',
						sizes: [{ id: 'uuid-1', diameter: 1.75, purchase_links: [] }]
					})
				)
			);
			const response = await proxyGetToCloud(variantPath);
			const data = await response.json();
			expect(data.sizes[0].discontinued).toBe(false);
		});

		it('preserves explicit discontinued=true', async () => {
			fetchMock.mockImplementationOnce(() =>
				Promise.resolve(
					jsonResponse({
						id: 'uuid-variant-red',
						slug: 'red',
						sizes: [
							{
								id: 'uuid-1',
								diameter: 1.75,
								discontinued: true,
								purchase_links: []
							}
						]
					})
				)
			);
			const response = await proxyGetToCloud(variantPath);
			const data = await response.json();
			expect(data.sizes[0].discontinued).toBe(true);
		});
	});

	describe('Error handling', () => {
		it('returns the upstream error code when the cloud responds with non-2xx', async () => {
			fetchMock.mockResolvedValueOnce(errorResponse(404));
			const response = await proxyGetToCloud('/api/brands/missing');
			expect(response.status).toBe(404);
			const data = await response.json();
			expect(data.error).toContain('404');
		});

		it('returns 502 when fetch throws', async () => {
			fetchMock.mockRejectedValueOnce(new Error('network down'));
			const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
			const response = await proxyGetToCloud('/api/brands');
			expect(response.status).toBe(502);
			const data = await response.json();
			expect(data.error).toMatch(/Failed/);
			errSpy.mockRestore();
		});
	});

	describe('proxyLogoToCloud', () => {
		it('returns the image body and content-type when fetch succeeds', async () => {
			fetchMock.mockResolvedValueOnce(imageResponse('image/png'));
			const response = await proxyLogoToCloud('brand', 'acme.png');
			expect(response.status).toBe(200);
			expect(response.headers.get('Content-Type')).toBe('image/png');
			expect(fetchMock).toHaveBeenCalledWith(
				`${API_BASE}/api/v1/brands/logo/acme.png`
			);
		});

		it('passes through stores logos under /stores/logo/', async () => {
			fetchMock.mockResolvedValueOnce(imageResponse('image/svg+xml'));
			const response = await proxyLogoToCloud('store', 'shop.svg');
			expect(response.status).toBe(200);
			expect(fetchMock).toHaveBeenCalledWith(
				`${API_BASE}/api/v1/stores/logo/shop.svg`
			);
		});

		it('returns 404 when the cloud responds with non-2xx', async () => {
			fetchMock.mockResolvedValueOnce(errorResponse(404));
			const response = await proxyLogoToCloud('brand', 'nope.png');
			expect(response.status).toBe(404);
		});

		it('returns 502 when fetch throws', async () => {
			fetchMock.mockRejectedValueOnce(new Error('network down'));
			const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
			const response = await proxyLogoToCloud('brand', 'acme.png');
			expect(response.status).toBe(502);
			errSpy.mockRestore();
		});

		it('defaults Content-Type to image/png when missing', async () => {
			const data = new Uint8Array([1, 2, 3, 4]);
			fetchMock.mockResolvedValueOnce(new Response(data, { status: 200 }));
			const response = await proxyLogoToCloud('brand', 'acme.png');
			expect(response.headers.get('Content-Type')).toBe('image/png');
		});
	});
});
