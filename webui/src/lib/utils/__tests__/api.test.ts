import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted runs before imports, so mock stores are ready when modules load
const envMocks = vi.hoisted(() => {
	let isLocalVal = true;
	let isCloudVal = false;
	let apiBaseVal = '';

	function makeStore<T>(initial: T) {
		let value = initial;
		const subs = new Set<(v: T) => void>();
		return {
			subscribe(fn: (v: T) => void) {
				fn(value);
				subs.add(fn);
				return () => { subs.delete(fn); };
			},
			set(v: T) {
				value = v;
				for (const fn of subs) fn(v);
			}
		};
	}

	return {
		mockIsLocalMode: makeStore(true),
		mockIsCloudMode: makeStore(false),
		mockApiBaseUrl: makeStore('')
	};
});

vi.mock('$lib/stores/environment', () => ({
	isLocalMode: envMocks.mockIsLocalMode,
	isCloudMode: envMocks.mockIsCloudMode,
	apiBaseUrl: envMocks.mockApiBaseUrl
}));

// Mock cache module - use vi.hoisted so mocks are available when factory runs
const cacheMocks = vi.hoisted(() => ({
	mockCacheGet: vi.fn(),
	mockCacheSet: vi.fn(),
	mockCacheDelete: vi.fn(),
	mockCacheDeleteByPrefix: vi.fn(),
	mockCacheClear: vi.fn()
}));

vi.mock('$lib/utils/cache', () => ({
	apiCache: {
		get: (...args: any[]) => cacheMocks.mockCacheGet(...args),
		set: (...args: any[]) => cacheMocks.mockCacheSet(...args),
		delete: (...args: any[]) => cacheMocks.mockCacheDelete(...args),
		deleteByPrefix: (...args: any[]) => cacheMocks.mockCacheDeleteByPrefix(...args),
		clear: () => cacheMocks.mockCacheClear()
	},
	getTTLForPath: () => 300000,
	isCacheEnabled: () => true
}));

// Mock global fetch
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

import { buildApiUrl, apiFetch, clearApiCache } from '../api';

describe('API Utils', () => {
	beforeEach(() => {
		envMocks.mockIsLocalMode.set(true);
		envMocks.mockIsCloudMode.set(false);
		envMocks.mockApiBaseUrl.set('');
		cacheMocks.mockCacheGet.mockReset();
		cacheMocks.mockCacheSet.mockReset();
		cacheMocks.mockCacheDelete.mockReset();
		cacheMocks.mockCacheDeleteByPrefix.mockReset();
		cacheMocks.mockCacheClear.mockReset();
		mockFetch.mockReset();
	});

	describe('buildApiUrl', () => {
		describe('Local mode', () => {
			it('should return path unchanged', () => {
				envMocks.mockIsLocalMode.set(true);
				envMocks.mockApiBaseUrl.set('');

				expect(buildApiUrl('/api/stores')).toBe('/api/stores');
				expect(buildApiUrl('/api/brands')).toBe('/api/brands');
				expect(buildApiUrl('/api/brands/acme')).toBe('/api/brands/acme');
			});
		});

		describe('Cloud mode', () => {
			beforeEach(() => {
				envMocks.mockIsLocalMode.set(false);
				envMocks.mockApiBaseUrl.set('https://api.example.com');
			});

			it('should transform /api/stores to /api/stores/index.json', () => {
				expect(buildApiUrl('/api/stores')).toBe('https://api.example.com/api/stores/index.json');
			});

			it('should transform /api/stores/[id] to /api/stores/[id].json', () => {
				expect(buildApiUrl('/api/stores/test-store')).toBe(
					'https://api.example.com/api/stores/test-store.json'
				);
			});

			it('should transform /api/brands to /api/brands/index.json', () => {
				expect(buildApiUrl('/api/brands')).toBe('https://api.example.com/api/brands/index.json');
			});

			it('should transform /api/brands/[id] to /api/brands/[id]/index.json', () => {
				expect(buildApiUrl('/api/brands/acme')).toBe(
					'https://api.example.com/api/brands/acme/index.json'
				);
			});

			it('should transform materials endpoint correctly', () => {
				// /api/brands/[id]/materials -> same as brand endpoint (materials included)
				expect(buildApiUrl('/api/brands/acme/materials')).toBe(
					'https://api.example.com/api/brands/acme/index.json'
				);

				// /api/brands/[id]/materials/[type]
				expect(buildApiUrl('/api/brands/acme/materials/PLA')).toBe(
					'https://api.example.com/api/brands/acme/materials/PLA/index.json'
				);
			});

			it('should transform filaments endpoint correctly', () => {
				// /api/brands/[id]/materials/[type]/filaments -> material index (includes filaments)
				expect(buildApiUrl('/api/brands/acme/materials/PLA/filaments')).toBe(
					'https://api.example.com/api/brands/acme/materials/PLA/index.json'
				);

				// /api/brands/[id]/materials/[type]/filaments/[filament]
				expect(buildApiUrl('/api/brands/acme/materials/PLA/filaments/basic')).toBe(
					'https://api.example.com/api/brands/acme/materials/PLA/filaments/basic/index.json'
				);
			});

			it('should transform variants endpoint correctly', () => {
				// /api/brands/[id]/materials/[type]/filaments/[filament]/variants -> filament index
				expect(buildApiUrl('/api/brands/acme/materials/PLA/filaments/basic/variants')).toBe(
					'https://api.example.com/api/brands/acme/materials/PLA/filaments/basic/index.json'
				);

				// /api/brands/[id]/materials/[type]/filaments/[filament]/variants/[variant]
				expect(buildApiUrl('/api/brands/acme/materials/PLA/filaments/basic/variants/red')).toBe(
					'https://api.example.com/api/brands/acme/materials/PLA/filaments/basic/variants/red.json'
				);
			});

			it('should handle logo endpoints (keep local)', () => {
				expect(buildApiUrl('/api/brands/acme/logo')).toBe('/api/brands/acme/logo');
				expect(buildApiUrl('/api/stores/test/logo/image.png')).toBe('/api/stores/test/logo/image.png');
			});

			it('should transform schemas endpoints', () => {
				expect(buildApiUrl('/api/schemas/brand')).toBe(
					'https://api.example.com/api/schemas/brand_schema.json'
				);
				expect(buildApiUrl('/api/schemas/store')).toBe(
					'https://api.example.com/api/schemas/store_schema.json'
				);
			});
		});
	});

	describe('apiFetch', () => {
		beforeEach(() => {
			envMocks.mockIsLocalMode.set(true);
			envMocks.mockIsCloudMode.set(false);
		});

		it('should make fetch request with correct URL', async () => {
			mockFetch.mockResolvedValue(
				new Response(JSON.stringify([{ id: 'test' }]), {
					status: 200,
					statusText: 'OK',
					headers: { 'Content-Type': 'application/json' }
				})
			);

			await apiFetch('/api/stores');

			expect(mockFetch).toHaveBeenCalledWith('/api/stores', undefined);
		});

		describe('Cloud mode caching', () => {
			beforeEach(() => {
				envMocks.mockIsLocalMode.set(false);
				envMocks.mockIsCloudMode.set(true);
				envMocks.mockApiBaseUrl.set('https://api.example.com');
			});

			it('should check cache for GET requests in cloud mode', async () => {
				cacheMocks.mockCacheGet.mockReturnValue({
					data: [{ id: 'cached' }],
					status: 200,
					statusText: 'OK'
				});

				const response = await apiFetch('/api/stores');
				const data = await response.json();

				expect(cacheMocks.mockCacheGet).toHaveBeenCalledWith('/api/stores');
				expect(data).toEqual([{ id: 'cached' }]);
			});

			it('should return cached response with X-Cache: HIT header', async () => {
				cacheMocks.mockCacheGet.mockReturnValue({
					data: [{ id: 'cached' }],
					status: 200,
					statusText: 'OK'
				});

				const response = await apiFetch('/api/stores');

				expect(response.headers.get('X-Cache')).toBe('HIT');
			});

			it('should cache transformed responses', async () => {
				cacheMocks.mockCacheGet.mockReturnValue(null);
				mockFetch.mockResolvedValue(
					new Response(JSON.stringify({ stores: [{ id: 'test', logo_slug: 'test.png' }] }), {
						status: 200,
						statusText: 'OK',
						headers: { 'Content-Type': 'application/json' }
					})
				);

				await apiFetch('/api/stores');

				expect(cacheMocks.mockCacheSet).toHaveBeenCalled();
				const cachedData = cacheMocks.mockCacheSet.mock.calls[0][1];
				expect(cachedData.data).toEqual([{ id: 'test', logo_slug: 'test.png', logo: 'test.png' }]);
			});

			it('should not cache non-GET requests', async () => {
				mockFetch.mockResolvedValue(
					new Response(JSON.stringify({ success: true }), {
						status: 200,
						statusText: 'OK',
						headers: { 'Content-Type': 'application/json' }
					})
				);

				await apiFetch('/api/stores/test', { method: 'PUT', body: '{}' });

				expect(cacheMocks.mockCacheGet).not.toHaveBeenCalled();
				expect(cacheMocks.mockCacheSet).not.toHaveBeenCalled();
			});

			it('should invalidate cache on mutations', async () => {
				mockFetch.mockResolvedValue(
					new Response(JSON.stringify({ success: true }), {
						status: 200,
						statusText: 'OK',
						headers: { 'Content-Type': 'application/json' }
					})
				);

				await apiFetch('/api/stores/test', { method: 'PUT', body: '{}' });

				expect(cacheMocks.mockCacheDelete).toHaveBeenCalledWith('/api/stores');
				expect(cacheMocks.mockCacheDeleteByPrefix).toHaveBeenCalledWith('/api/stores/');
			});
		});

		describe('Response transformation', () => {
			beforeEach(() => {
				envMocks.mockIsLocalMode.set(false);
				envMocks.mockIsCloudMode.set(true);
				envMocks.mockApiBaseUrl.set('https://api.example.com');
				cacheMocks.mockCacheGet.mockReturnValue(null);
			});

			it('should extract stores array from cloud response', async () => {
				mockFetch.mockResolvedValue(
					new Response(
						JSON.stringify({
							version: '1.0',
							stores: [{ id: 'store1' }, { id: 'store2' }]
						}),
						{ status: 200, statusText: 'OK', headers: { 'Content-Type': 'application/json' } }
					)
				);

				const response = await apiFetch('/api/stores');
				const data = await response.json();

				expect(Array.isArray(data)).toBe(true);
				expect(data.length).toBe(2);
			});

			it('should extract brands array from cloud response', async () => {
				mockFetch.mockResolvedValue(
					new Response(
						JSON.stringify({
							version: '1.0',
							brands: [{ id: 'brand1' }, { id: 'brand2' }]
						}),
						{ status: 200, statusText: 'OK', headers: { 'Content-Type': 'application/json' } }
					)
				);

				const response = await apiFetch('/api/brands');
				const data = await response.json();

				expect(Array.isArray(data)).toBe(true);
				expect(data.length).toBe(2);
			});

			it('should extract materials array from brand response', async () => {
				mockFetch.mockResolvedValue(
					new Response(
						JSON.stringify({
							id: 'acme',
							name: 'Acme',
							materials: [{ id: 'PLA' }, { id: 'PETG' }]
						}),
						{ status: 200, statusText: 'OK', headers: { 'Content-Type': 'application/json' } }
					)
				);

				const response = await apiFetch('/api/brands/acme/materials');
				const data = await response.json();

				expect(Array.isArray(data)).toBe(true);
				expect(data).toEqual([{ id: 'PLA' }, { id: 'PETG' }]);
			});

			it('should extract filaments array from material response', async () => {
				mockFetch.mockResolvedValue(
					new Response(
						JSON.stringify({
							id: 'PLA',
							filaments: [{ id: 'basic' }, { id: 'premium' }]
						}),
						{ status: 200, statusText: 'OK', headers: { 'Content-Type': 'application/json' } }
					)
				);

				const response = await apiFetch('/api/brands/acme/materials/PLA/filaments');
				const data = await response.json();

				expect(Array.isArray(data)).toBe(true);
				expect(data).toEqual([{ id: 'basic' }, { id: 'premium' }]);
			});

			it('should extract variants array from filament response', async () => {
				mockFetch.mockResolvedValue(
					new Response(
						JSON.stringify({
							id: 'basic',
							variants: [{ id: 'red' }, { id: 'blue' }]
						}),
						{ status: 200, statusText: 'OK', headers: { 'Content-Type': 'application/json' } }
					)
				);

				const response = await apiFetch('/api/brands/acme/materials/PLA/filaments/basic/variants');
				const data = await response.json();

				expect(Array.isArray(data)).toBe(true);
				expect(data).toEqual([{ id: 'red' }, { id: 'blue' }]);
			});

			it('should map logo_slug to logo', async () => {
				mockFetch.mockResolvedValue(
					new Response(
						JSON.stringify({
							version: '1.0',
							stores: [{ id: 'store1', logo_slug: 'store1-logo.svg' }]
						}),
						{ status: 200, statusText: 'OK', headers: { 'Content-Type': 'application/json' } }
					)
				);

				const response = await apiFetch('/api/stores');
				const data = await response.json();

				expect(data[0].logo).toBe('store1-logo.svg');
			});

			it('should return data unchanged in local mode', async () => {
				envMocks.mockIsLocalMode.set(true);
				envMocks.mockIsCloudMode.set(false);

				const localData = [{ id: 'store1', logo: 'logo.png' }];
				mockFetch.mockResolvedValue(
					new Response(JSON.stringify(localData), {
						status: 200,
						statusText: 'OK',
						headers: { 'Content-Type': 'application/json' }
					})
				);

				const response = await apiFetch('/api/stores');
				const data = await response.json();

				expect(data).toEqual(localData);
			});
		});

		it('should handle JSON parse errors gracefully', async () => {
			mockFetch.mockResolvedValue(
				new Response('not valid json', {
					status: 200,
					statusText: 'OK',
					headers: { 'Content-Type': 'text/plain' }
				})
			);

			const response = await apiFetch('/api/stores');

			// Should return the original response
			expect(response).toBeDefined();
		});
	});

	describe('clearApiCache', () => {
		it('should clear all cached responses', () => {
			clearApiCache();

			expect(cacheMocks.mockCacheClear).toHaveBeenCalled();
		});
	});
});
