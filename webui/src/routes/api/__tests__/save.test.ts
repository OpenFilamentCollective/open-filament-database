/**
 * Tests for the /api/save endpoint (local-mode batch save).
 *
 * Covers:
 *  - Cloud-mode rejection (403)
 *  - Input validation (400)
 *  - Delete handling
 *  - Create/update file writes
 *  - Variant sizes extraction into sizes.json
 *  - Image upload validation (extension, size, traversal)
 *  - Multi-status response when some changes fail
 *  - 500 on unexpected error
 *
 * Python invocation is mocked so tests don't touch the real CLI.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const fsMock = vi.hoisted(() => ({
	mkdir: vi.fn(),
	writeFile: vi.fn(),
	readFile: vi.fn(),
	rm: vi.fn()
}));

vi.mock('fs', () => {
	const promises = {
		mkdir: (...args: any[]) => fsMock.mkdir(...args),
		writeFile: (...args: any[]) => fsMock.writeFile(...args),
		readFile: (...args: any[]) => fsMock.readFile(...args),
		rm: (...args: any[]) => fsMock.rm(...args)
	};
	return { default: { promises }, promises };
});

// Mock child_process to avoid spawning python3
vi.mock('node:child_process', () => {
	const spawn = vi.fn(() => {
		const handlers: Record<string, (...args: any[]) => void> = {};
		return {
			stdout: { on: vi.fn((event: string, cb: any) => { handlers['stdout_' + event] = cb; }) },
			stderr: { on: vi.fn((event: string, cb: any) => { handlers['stderr_' + event] = cb; }) },
			on: vi.fn((event: string, cb: any) => {
				handlers[event] = cb;
				if (event === 'close') {
					queueMicrotask(() => {
						handlers['stdout_data']?.(Buffer.from(JSON.stringify({ ok: true })));
						cb(0);
					});
				}
			})
		};
	});
	return { spawn, default: { spawn } };
});

// IS_LOCAL toggle
let isLocal = true;
vi.mock('$lib/server/cloudProxy', () => ({
	get IS_LOCAL() {
		return isLocal;
	}
}));

vi.mock('@sveltejs/kit', () => ({
	json: (data: any, init?: { status?: number }) => ({
		status: init?.status ?? 200,
		body: data,
		json: async () => data
	})
}));

import { POST } from '../save/+server';

function makeRequest(body: any): any {
	return { request: { json: async () => body } };
}

describe('POST /api/save', () => {
	beforeEach(() => {
		fsMock.mkdir.mockReset();
		fsMock.writeFile.mockReset();
		fsMock.readFile.mockReset();
		fsMock.rm.mockReset();
		fsMock.mkdir.mockResolvedValue(undefined);
		fsMock.writeFile.mockResolvedValue(undefined);
		// Default: nothing on disk yet at the target path.
		fsMock.readFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
		fsMock.rm.mockResolvedValue(undefined);
		isLocal = true;
	});

	it('returns 403 when not in local mode', async () => {
		isLocal = false;
		const res: any = await POST(makeRequest({ changes: [] }));
		expect(res.status).toBe(403);
		expect(res.body.error).toMatch(/local mode/i);
	});

	it('returns 400 when changes is missing', async () => {
		const res: any = await POST(makeRequest({}));
		expect(res.status).toBe(400);
		expect(res.body.error).toMatch(/changes array/i);
	});

	it('returns 400 when changes is not an array', async () => {
		const res: any = await POST(makeRequest({ changes: 'oops' }));
		expect(res.status).toBe(400);
	});

	it('writes a create change to disk and runs style+validate when successful', async () => {
		const res: any = await POST(
			makeRequest({
				changes: [
					{
						entity: { type: 'brand', id: 'acme', path: 'brands/acme' },
						operation: 'create',
						data: { id: 'acme', name: 'Acme' }
					}
				]
			})
		);

		expect(res.status).toBe(200);
		expect(res.body.success).toBe(true);
		expect(fsMock.writeFile).toHaveBeenCalled();
		// First arg ends with brand.json
		expect(fsMock.writeFile.mock.calls[0][0]).toMatch(/brands\/acme.*?brand\.json$|acme[\\/]brand\.json$/);
		expect(res.body.results[0].success).toBe(true);
		expect(res.body.results[0].operation).toBe('create');
	});

	it('extracts variant sizes into a separate sizes.json', async () => {
		await POST(
			makeRequest({
				changes: [
					{
						entity: {
							type: 'variant',
							id: 'red',
							path: 'brands/acme/materials/PLA/filaments/basic/variants/red'
						},
						operation: 'create',
						data: {
							id: 'red',
							color_name: 'Red',
							color_hex: 'FF0000',
							sizes: [{ diameter: 1.75, weight: 1000 }]
						}
					}
				]
			})
		);

		const writeCalls = fsMock.writeFile.mock.calls.map((c: any[]) => c[0] as string);
		const variantWrite = writeCalls.find((p) => p.endsWith('variant.json'));
		const sizesWrite = writeCalls.find((p) => p.endsWith('sizes.json'));
		expect(variantWrite).toBeDefined();
		expect(sizesWrite).toBeDefined();
		// Variant.json content should NOT include the sizes array
		const variantContent = fsMock.writeFile.mock.calls.find(
			(c: any[]) => (c[0] as string).endsWith('variant.json')
		)![1] as string;
		expect(variantContent).not.toContain('"sizes"');
	});

	// The write replaces the whole file, so a payload staged before the entity got
	// its canonical uuid must not drop the one already on disk.
	it('keeps the uuid already on disk when the payload has none', async () => {
		fsMock.readFile.mockImplementation(async (filePath: string) => {
			if (filePath.endsWith('variant.json')) {
				return JSON.stringify({ uuid: 'variant-uuid', id: 'red', color_hex: 'FF0000' });
			}
			if (filePath.endsWith('sizes.json')) {
				return JSON.stringify([{ uuid: 'size-uuid', filament_weight: 1000, diameter: 1.75 }]);
			}
			throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
		});

		await POST(
			makeRequest({
				changes: [
					{
						entity: {
							type: 'variant',
							id: 'red',
							path: 'brands/acme/materials/PLA/filaments/basic/variants/red'
						},
						operation: 'create',
						data: {
							id: 'red',
							color_hex: 'FF0000',
							sizes: [{ filament_weight: 1000, diameter: 1.75 }]
						}
					}
				]
			})
		);

		const contentFor = (suffix: string) =>
			JSON.parse(
				fsMock.writeFile.mock.calls.find((c: any[]) => (c[0] as string).endsWith(suffix))![1] as string
			);

		expect(contentFor('variant.json').uuid).toBe('variant-uuid');
		expect(contentFor('sizes.json')[0].uuid).toBe('size-uuid');
	});

	it('skips sizes.json when sizes array is empty', async () => {
		await POST(
			makeRequest({
				changes: [
					{
						entity: {
							type: 'variant',
							id: 'red',
							path: 'brands/acme/materials/PLA/filaments/basic/variants/red'
						},
						operation: 'create',
						data: { id: 'red', color_name: 'Red', color_hex: 'FF0000', sizes: [] }
					}
				]
			})
		);

		const writeCalls = fsMock.writeFile.mock.calls.map((c: any[]) => c[0] as string);
		expect(writeCalls.some((p) => p.endsWith('sizes.json'))).toBe(false);
	});

	it('deletes process before creates', async () => {
		// Track call order across rm and writeFile
		const callOrder: string[] = [];
		fsMock.rm.mockImplementation(async () => {
			callOrder.push('rm');
		});
		fsMock.writeFile.mockImplementation(async () => {
			callOrder.push('write');
		});

		await POST(
			makeRequest({
				changes: [
					{
						entity: { type: 'brand', id: 'new', path: 'brands/new' },
						operation: 'create',
						data: { id: 'new', name: 'New' }
					},
					{
						entity: { type: 'brand', id: 'gone', path: 'brands/gone' },
						operation: 'delete'
					}
				]
			})
		);

		expect(callOrder[0]).toBe('rm');
		expect(callOrder.indexOf('write')).toBeGreaterThan(callOrder.indexOf('rm'));
	});

	it('reports per-change failure when an entity path is invalid', async () => {
		const res: any = await POST(
			makeRequest({
				changes: [
					{
						entity: { type: 'brand', id: '..', path: 'brands/..' },
						operation: 'create',
						data: { id: '..' }
					}
				]
			})
		);

		expect(res.status).toBe(207);
		expect(res.body.success).toBe(false);
		expect(res.body.results[0].success).toBe(false);
	});

	it('replaces image-ID logo references with the resolved filename before writing', async () => {
		await POST(
			makeRequest({
				changes: [
					{
						entity: { type: 'brand', id: 'acme', path: 'brands/acme' },
						operation: 'update',
						data: { id: 'acme', name: 'Acme', logo: 'brand_acme_logo_123' }
					}
				],
				images: {
					brand_acme_logo_123: {
						entityPath: 'brands/acme',
						filename: 'logo.png',
						data: Buffer.from([1, 2, 3, 4]).toString('base64')
					}
				}
			})
		);

		// The brand.json write should contain "logo.png", not the image ID
		const brandWrite = fsMock.writeFile.mock.calls.find(
			(c: any[]) => (c[0] as string).endsWith('brand.json')
		);
		expect(brandWrite).toBeDefined();
		expect(brandWrite![1]).toContain('"logo.png"');
		expect(brandWrite![1]).not.toContain('brand_acme_logo_123');
	});

	it('rejects image uploads with disallowed extensions', async () => {
		const res: any = await POST(
			makeRequest({
				changes: [],
				images: {
					evil: {
						entityPath: 'brands/acme',
						filename: 'pwn.exe',
						data: Buffer.from([1, 2, 3]).toString('base64')
					}
				}
			})
		);
		// imageResults should contain a failure
		const imageResults = res.body.imageResults ?? [];
		const failed = imageResults.find((r: any) => !r.success);
		expect(failed).toBeDefined();
		expect(failed.error).toMatch(/Disallowed/);
	});

	it('rejects images whose filename contains a traversal segment', async () => {
		const res: any = await POST(
			makeRequest({
				changes: [],
				images: {
					evil: {
						entityPath: 'brands/acme',
						filename: '../escape.png',
						data: Buffer.from([1, 2, 3]).toString('base64')
					}
				}
			})
		);
		const imageResults = res.body.imageResults ?? [];
		const failed = imageResults.find((r: any) => !r.success);
		expect(failed).toBeDefined();
		expect(failed.error).toMatch(/Invalid filename/);
	});

	it('writes valid images alongside the entity directory', async () => {
		await POST(
			makeRequest({
				changes: [],
				images: {
					good: {
						entityPath: 'brands/acme',
						filename: 'logo.png',
						data: Buffer.from('iVBOR', 'utf-8').toString('base64')
					}
				}
			})
		);

		// At least one writeFile call should target the image filename
		const imageWrite = fsMock.writeFile.mock.calls.find(
			(c: any[]) => (c[0] as string).endsWith('logo.png')
		);
		expect(imageWrite).toBeDefined();
		expect(imageWrite![1]).toBeInstanceOf(Buffer);
	});

	it('returns 500 when the request body cannot be parsed', async () => {
		const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const res: any = await POST({
			request: { json: async () => { throw new Error('bad json'); } }
		} as any);
		expect(res.status).toBe(500);
		expect(res.body.error).toMatch(/Failed/);
		errSpy.mockRestore();
	});
});
