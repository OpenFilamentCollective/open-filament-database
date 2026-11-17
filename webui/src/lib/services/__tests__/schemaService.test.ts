/**
 * Tests for the schema service.
 *
 * Covers:
 *  - URL routing: local API vs cloud API based on apiBaseUrl
 *  - Caching: a second fetch for the same URL is served from cache
 *  - Description / enum / trait extraction helpers
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { writable } from 'svelte/store';

const apiBaseUrlStore = vi.hoisted(() => {
	// Use a real writable to mimic the actual store shape
	const { writable } = require('svelte/store') as typeof import('svelte/store');
	return writable<string>('');
});

vi.mock('$lib/stores/environment', () => ({
	apiBaseUrl: apiBaseUrlStore
}));

import {
	fetchSchema,
	fetchEntitySchema,
	clearSchemaCache,
	extractSchemaDescriptions,
	extractSchemaEnums,
	getFieldDescription,
	extractTraitsFromSchema,
	SCHEMA_NAMES,
	ENTITY_ROUTES
} from '../schemaService';

describe('schemaService', () => {
	const fetchMock = vi.fn();

	beforeEach(() => {
		fetchMock.mockReset();
		vi.stubGlobal('fetch', fetchMock);
		apiBaseUrlStore.set('');
		clearSchemaCache();
	});

	describe('SCHEMA_NAMES / ENTITY_ROUTES', () => {
		it('maps every entity type to a schema filename and route', () => {
			const expectedTypes = ['brand', 'material', 'filament', 'variant', 'store', 'materialTypes'];
			for (const t of expectedTypes) {
				expect(SCHEMA_NAMES).toHaveProperty(t);
				expect(ENTITY_ROUTES).toHaveProperty(t);
			}
		});

		it('SCHEMA_NAMES values are all *_schema.json files', () => {
			for (const filename of Object.values(SCHEMA_NAMES)) {
				expect(filename).toMatch(/_schema\.json$/);
			}
		});
	});

	describe('fetchEntitySchema (mode routing)', () => {
		it('uses /api/schemas/{route} in local mode (empty apiBaseUrl)', async () => {
			apiBaseUrlStore.set('');
			fetchMock.mockResolvedValueOnce(
				new Response(JSON.stringify({ ok: true }), { status: 200 })
			);

			await fetchEntitySchema('brand');

			expect(fetchMock).toHaveBeenCalledWith('/api/schemas/brand');
		});

		it('uses the cloud schemas URL when apiBaseUrl is set', async () => {
			apiBaseUrlStore.set('https://api.example.com');
			fetchMock.mockResolvedValueOnce(
				new Response(JSON.stringify({ ok: true }), { status: 200 })
			);

			await fetchEntitySchema('material');

			expect(fetchMock).toHaveBeenCalledWith(
				'https://api.example.com/api/v1/schemas/material_schema.json'
			);
		});

		it('returns null when the upstream responds non-2xx', async () => {
			fetchMock.mockResolvedValueOnce(new Response('not found', { status: 404 }));
			const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

			const result = await fetchEntitySchema('brand');

			expect(result).toBeNull();
			warnSpy.mockRestore();
		});

		it('returns null when fetch throws', async () => {
			fetchMock.mockRejectedValueOnce(new Error('network down'));
			const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

			const result = await fetchEntitySchema('brand');

			expect(result).toBeNull();
			errSpy.mockRestore();
		});
	});

	describe('caching', () => {
		it('serves repeated fetches of the same URL from cache', async () => {
			apiBaseUrlStore.set('');
			fetchMock.mockResolvedValueOnce(
				new Response(JSON.stringify({ id: 'brand_schema' }), { status: 200 })
			);

			const first = await fetchEntitySchema('brand');
			const second = await fetchEntitySchema('brand');

			expect(fetchMock).toHaveBeenCalledTimes(1);
			expect(first).toEqual({ id: 'brand_schema' });
			expect(second).toEqual({ id: 'brand_schema' });
		});

		it('clearSchemaCache forces re-fetch', async () => {
			apiBaseUrlStore.set('');
			fetchMock
				.mockResolvedValueOnce(
					new Response(JSON.stringify({ id: 'v1' }), { status: 200 })
				)
				.mockResolvedValueOnce(
					new Response(JSON.stringify({ id: 'v2' }), { status: 200 })
				);

			await fetchEntitySchema('brand');
			clearSchemaCache();
			const refreshed = await fetchEntitySchema('brand');

			expect(fetchMock).toHaveBeenCalledTimes(2);
			expect(refreshed).toEqual({ id: 'v2' });
		});

		it('caches per-URL, so cloud mode and local mode are separate entries', async () => {
			apiBaseUrlStore.set('');
			fetchMock.mockResolvedValueOnce(
				new Response(JSON.stringify({ id: 'local' }), { status: 200 })
			);
			await fetchEntitySchema('brand');

			apiBaseUrlStore.set('https://api.example.com');
			fetchMock.mockResolvedValueOnce(
				new Response(JSON.stringify({ id: 'cloud' }), { status: 200 })
			);
			await fetchEntitySchema('brand');

			expect(fetchMock).toHaveBeenCalledTimes(2);
		});
	});

	describe('fetchSchema (direct)', () => {
		it('uses /api/v1/schemas/{name} against the apiBaseUrl', async () => {
			apiBaseUrlStore.set('https://api.example.com');
			fetchMock.mockResolvedValueOnce(
				new Response(JSON.stringify({}), { status: 200 })
			);

			await fetchSchema('brand_schema.json');

			expect(fetchMock).toHaveBeenCalledWith(
				'https://api.example.com/api/v1/schemas/brand_schema.json'
			);
		});
	});

	describe('extractSchemaDescriptions', () => {
		it('extracts top-level property descriptions', () => {
			const schema = {
				properties: {
					name: { type: 'string', description: 'The display name' },
					website: { type: 'string', description: 'Public website' }
				}
			};
			const result = extractSchemaDescriptions(schema);
			expect(result.name).toBe('The display name');
			expect(result.website).toBe('Public website');
		});

		it('recurses into nested object properties', () => {
			const schema = {
				properties: {
					traits: {
						type: 'object',
						properties: {
							translucent: { description: 'Allows light through' }
						}
					}
				}
			};
			const result = extractSchemaDescriptions(schema);
			expect(result['traits.translucent']).toBe('Allows light through');
			expect(result['translucent']).toBe('Allows light through');
		});

		it('extracts from array item schemas', () => {
			const schema = {
				properties: {
					sizes: {
						type: 'array',
						items: {
							properties: { diameter: { description: 'in mm' } }
						}
					}
				}
			};
			const result = extractSchemaDescriptions(schema);
			expect(result['sizes.diameter']).toBe('in mm');
		});

		it('extracts from $defs', () => {
			const schema = {
				$defs: {
					Color: {
						properties: { hex: { description: 'Hex color code' } }
					}
				}
			};
			const result = extractSchemaDescriptions(schema);
			expect(result['Color.hex']).toBe('Hex color code');
		});

		it('returns empty object for null/undefined schema', () => {
			expect(extractSchemaDescriptions(null)).toEqual({});
			expect(extractSchemaDescriptions(undefined)).toEqual({});
		});
	});

	describe('extractSchemaEnums', () => {
		it('extracts top-level enum properties', () => {
			const schema = {
				properties: {
					origin: { type: 'string', enum: ['China', 'USA', 'Japan'] },
					material: { type: 'string' }
				}
			};
			const result = extractSchemaEnums(schema);
			expect(result.origin).toEqual(['China', 'USA', 'Japan']);
			expect(result.material).toBeUndefined();
		});

		it('returns empty object when no enums exist', () => {
			const schema = { properties: { name: { type: 'string' } } };
			expect(extractSchemaEnums(schema)).toEqual({});
		});

		it('returns empty object for malformed schema', () => {
			expect(extractSchemaEnums(null)).toEqual({});
			expect(extractSchemaEnums({})).toEqual({});
		});

		it('ignores enum-like properties that are not arrays', () => {
			const schema = {
				properties: {
					origin: { enum: 'not-an-array' as any }
				}
			};
			expect(extractSchemaEnums(schema)).toEqual({});
		});
	});

	describe('getFieldDescription', () => {
		const schema = {
			properties: {
				name: { description: 'Name desc' }
			}
		};

		it('returns the description for a known field', () => {
			expect(getFieldDescription(schema, 'name')).toBe('Name desc');
		});

		it('returns the fallback when the field is unknown', () => {
			expect(getFieldDescription(schema, 'missing', 'default text')).toBe('default text');
		});

		it('defaults the fallback to the empty string', () => {
			expect(getFieldDescription(schema, 'missing')).toBe('');
		});
	});

	describe('extractTraitsFromSchema', () => {
		it('extracts boolean trait properties from variant schema (traits.properties)', () => {
			const variantSchema = {
				properties: {
					traits: {
						properties: {
							translucent: { type: 'boolean', 'x-category': 'optical', description: 'See-through' },
							glow_in_the_dark: { type: 'boolean', description: 'Glows' }
						}
					}
				}
			};
			const traits = extractTraitsFromSchema(variantSchema);
			expect(traits.translucent).toEqual({ description: 'See-through' });
			expect(traits.glow_in_the_dark).toEqual({ description: 'Glows' });
		});

		it('skips non-boolean properties', () => {
			const schema = {
				properties: {
					traits: {
						properties: {
							name: { type: 'string', description: 'Should not appear' },
							translucent: { type: 'boolean', 'x-category': 'optical' }
						}
					}
				}
			};
			const traits = extractTraitsFromSchema(schema);
			expect(traits.name).toBeUndefined();
			expect(traits.translucent).toBeDefined();
		});

		it('skips boolean properties lacking both x-category and description', () => {
			const schema = {
				properties: {
					traits: {
						properties: {
							untyped_bool: { type: 'boolean' },
							valid_trait: { type: 'boolean', description: 'has desc' }
						}
					}
				}
			};
			const traits = extractTraitsFromSchema(schema);
			expect(traits.untyped_bool).toBeUndefined();
			expect(traits.valid_trait).toBeDefined();
		});

		it('falls back to schema.properties when traits.properties is missing', () => {
			const schema = {
				properties: {
					translucent: { type: 'boolean', description: 'top-level' }
				}
			};
			const traits = extractTraitsFromSchema(schema);
			expect(traits.translucent).toBeDefined();
		});
	});
});
