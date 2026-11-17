/**
 * Tests for the /api/schemas/* endpoints.
 *
 * All schema endpoints share the createSchemaHandler factory:
 *  - In local mode, read the schema JSON file from disk
 *  - In cloud mode, proxy to the cloud API
 *  - Return 404 if the file is unreadable
 *
 * We test the factory directly plus a representative real route handler
 * (/api/schemas/brand) to confirm wiring.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const fsMock = vi.hoisted(() => ({
	readFile: vi.fn()
}));

vi.mock('fs', () => {
	const promises = { readFile: (...args: any[]) => fsMock.readFile(...args) };
	return { default: { promises }, promises };
});

const cloudProxy = vi.hoisted(() => ({
	IS_CLOUD: false,
	proxyGetToCloud: vi.fn()
}));
vi.mock('$lib/server/cloudProxy', () => ({
	get IS_CLOUD() {
		return cloudProxy.IS_CLOUD;
	},
	proxyGetToCloud: cloudProxy.proxyGetToCloud
}));

vi.mock('@sveltejs/kit', () => ({
	json: (data: any, init?: { status?: number }) => ({
		status: init?.status ?? 200,
		body: data,
		json: async () => data
	})
}));

import { createSchemaHandler } from '$lib/server/schemaHandler';

describe('createSchemaHandler', () => {
	beforeEach(() => {
		fsMock.readFile.mockReset();
		cloudProxy.proxyGetToCloud.mockReset();
		cloudProxy.IS_CLOUD = false;
	});

	it('reads the schema JSON from disk in local mode and returns it', async () => {
		fsMock.readFile.mockResolvedValueOnce(JSON.stringify({ id: 'brand_schema' }));
		const handler = createSchemaHandler('brand');

		const res: any = await handler();

		expect(res.status).toBe(200);
		expect(res.body).toEqual({ id: 'brand_schema' });
		// The path passed to readFile should end with brand_schema.json
		expect(fsMock.readFile.mock.calls[0][0]).toMatch(/brand_schema\.json$/);
	});

	it.each(['brand', 'material', 'filament', 'variant', 'store'])(
		'%s handler reads the matching schema file',
		async (entityType) => {
			fsMock.readFile.mockResolvedValueOnce(JSON.stringify({ id: `${entityType}_schema` }));
			const handler = createSchemaHandler(entityType);

			const res: any = await handler();

			expect(res.status).toBe(200);
			expect(fsMock.readFile.mock.calls[0][0]).toMatch(new RegExp(`${entityType}_schema\\.json$`));
		}
	);

	it('returns 404 with an error when the schema file cannot be read', async () => {
		fsMock.readFile.mockRejectedValueOnce(new Error('ENOENT'));
		const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const handler = createSchemaHandler('brand');

		const res: any = await handler();

		expect(res.status).toBe(404);
		expect(res.body.error).toMatch(/not found/i);
		errSpy.mockRestore();
	});

	it('returns 404 when the schema file contains invalid JSON', async () => {
		fsMock.readFile.mockResolvedValueOnce('{not-valid-json');
		const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const handler = createSchemaHandler('brand');

		const res: any = await handler();

		expect(res.status).toBe(404);
		errSpy.mockRestore();
	});

	it('proxies to the cloud API when IS_CLOUD is true', async () => {
		cloudProxy.IS_CLOUD = true;
		cloudProxy.proxyGetToCloud.mockResolvedValueOnce(
			new Response(JSON.stringify({ id: 'cloud_schema' }), { status: 200 })
		);
		const handler = createSchemaHandler('brand');

		const res: any = await handler();

		expect(cloudProxy.proxyGetToCloud).toHaveBeenCalledWith('/api/schemas/brand');
		expect(fsMock.readFile).not.toHaveBeenCalled();
		expect(res).toBeInstanceOf(Response);
	});
});

describe('GET /api/schemas/brand handler wiring', () => {
	beforeEach(() => {
		fsMock.readFile.mockReset();
		cloudProxy.IS_CLOUD = false;
	});

	it('is wired through createSchemaHandler and reads brand_schema.json', async () => {
		fsMock.readFile.mockResolvedValueOnce(JSON.stringify({ id: 'brand_schema' }));
		const { GET } = await import('../schemas/brand/+server');

		const res: any = await (GET as any)();

		expect(res.status).toBe(200);
		expect(res.body.id).toBe('brand_schema');
		expect(fsMock.readFile.mock.calls[0][0]).toMatch(/brand_schema\.json$/);
	});
});
