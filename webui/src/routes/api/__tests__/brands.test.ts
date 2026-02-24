import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fs module
const mockReaddir = vi.fn();
const mockReadFile = vi.fn();
const mockWriteFile = vi.fn();
const mockAccess = vi.fn();
const mockRm = vi.fn();

vi.mock('fs', () => {
	const promises = {
		readdir: (...args: any[]) => mockReaddir(...args),
		readFile: (...args: any[]) => mockReadFile(...args),
		writeFile: (...args: any[]) => mockWriteFile(...args),
		access: (...args: any[]) => mockAccess(...args),
		rm: (...args: any[]) => mockRm(...args)
	};
	return { default: { promises }, promises };
});

// Mock $env/dynamic/public
let mockAppMode = 'local';
vi.mock('$env/dynamic/public', () => ({
	env: {
		get PUBLIC_APP_MODE() {
			return mockAppMode;
		},
		PUBLIC_API_BASE_URL: ''
	}
}));

// Mock @sveltejs/kit
vi.mock('@sveltejs/kit', () => ({
	json: (data: any, init?: { status?: number }) => ({
		status: init?.status || 200,
		body: data,
		json: async () => data
	})
}));

describe('Brands API', () => {
	beforeEach(() => {
		mockReaddir.mockReset();
		mockReadFile.mockReset();
		mockWriteFile.mockReset();
		mockAccess.mockReset();
		mockRm.mockReset();
		mockAppMode = 'local';
	});

	describe('GET /api/brands', () => {
		it('should return list of all brands', async () => {
			mockReaddir.mockResolvedValue([
				{ name: 'brand1', isDirectory: () => true },
				{ name: 'brand2', isDirectory: () => true }
			]);
			mockReadFile
				.mockResolvedValueOnce(JSON.stringify({ id: 'brand1', name: 'Brand 1' }))
				.mockResolvedValueOnce(JSON.stringify({ id: 'brand2', name: 'Brand 2' }));

			const { GET } = await import('../brands/+server');
			const response = await GET({ params: {} } as any);
			const data = await response.json();

			expect(data).toHaveLength(2);
			expect(data[0].name).toBe('Brand 1');
			expect(data[1].name).toBe('Brand 2');
		});

		it('should return empty array when no brands exist', async () => {
			mockReaddir.mockResolvedValue([]);

			const { GET } = await import('../brands/+server');
			const response = await GET({ params: {} } as any);
			const data = await response.json();

			expect(data).toEqual([]);
		});

		it('should filter out directories without brand.json', async () => {
			mockReaddir.mockResolvedValue([
				{ name: 'brand1', isDirectory: () => true },
				{ name: 'not-a-brand', isDirectory: () => true }
			]);
			mockReadFile
				.mockResolvedValueOnce(JSON.stringify({ id: 'brand1', name: 'Brand 1' }))
				.mockRejectedValueOnce(new Error('ENOENT'));

			const { GET } = await import('../brands/+server');
			const response = await GET({ params: {} } as any);
			const data = await response.json();

			expect(data).toHaveLength(1);
			expect(data[0].id).toBe('brand1');
		});

		it('should return 500 on filesystem error', async () => {
			mockReaddir.mockRejectedValue(new Error('Filesystem error'));

			const { GET } = await import('../brands/+server');
			const response = await GET({ params: {} } as any);

			expect(response.status).toBe(500);
		});
	});

	describe('GET /api/brands/[id]', () => {
		it('should return brand by ID', async () => {
			mockAccess.mockResolvedValue(undefined);
			mockReadFile.mockResolvedValue(JSON.stringify({ id: 'test', name: 'Test Brand' }));

			const { GET } = await import('../brands/[id]/+server');
			const response = await GET({ params: { id: 'test' } } as any);
			const data = await response.json();

			expect(data.name).toBe('Test Brand');
		});

		it('should normalize brand ID (hyphen to underscore)', async () => {
			mockAccess
				.mockRejectedValueOnce(new Error('ENOENT')) // First try with hyphens fails
				.mockResolvedValueOnce(undefined); // Second try with underscores succeeds
			mockReadFile.mockResolvedValue(JSON.stringify({ id: 'test_brand', name: 'Test' }));

			const { GET } = await import('../brands/[id]/+server');
			await GET({ params: { id: 'test-brand' } } as any);

			// Should have tried to read with normalized ID
			expect(mockReadFile).toHaveBeenCalled();
		});

		it('should return 404 for non-existent brand', async () => {
			mockAccess.mockRejectedValue(new Error('ENOENT'));

			const { GET } = await import('../brands/[id]/+server');
			const response = await GET({ params: { id: 'non-existent' } } as any);

			expect(response.status).toBe(404);
		});
	});

	describe('PUT /api/brands/[id]', () => {
		it('should update existing brand', async () => {
			mockAccess.mockResolvedValue(undefined);
			mockWriteFile.mockResolvedValue(undefined);

			const brand = { id: 'test', name: 'Updated Brand' };
			const { PUT } = await import('../brands/[id]/+server');
			const response = await PUT({
				params: { id: 'test' },
				request: { json: async () => brand }
			} as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(mockWriteFile).toHaveBeenCalled();
		});

		it('should format JSON with 4-space indentation', async () => {
			mockAccess.mockResolvedValue(undefined);
			mockWriteFile.mockResolvedValue(undefined);

			const brand = { id: 'test', name: 'Test' };
			const { PUT } = await import('../brands/[id]/+server');
			await PUT({
				params: { id: 'test' },
				request: { json: async () => brand }
			} as any);

			const writtenContent = mockWriteFile.mock.calls[0][1];
			expect(writtenContent).toContain('    '); // 4-space indentation
			expect(writtenContent.endsWith('\n')).toBe(true);
		});

		it('should return 500 on write error', async () => {
			mockAccess.mockResolvedValue(undefined);
			mockWriteFile.mockRejectedValue(new Error('Write error'));

			const { PUT } = await import('../brands/[id]/+server');
			const response = await PUT({
				params: { id: 'test' },
				request: { json: async () => ({ id: 'test' }) }
			} as any);

			expect(response.status).toBe(500);
		});
	});

	describe('DELETE /api/brands/[id]', () => {
		it('should delete brand in local mode', async () => {
			mockAppMode = 'local';
			mockAccess.mockResolvedValue(undefined);
			mockRm.mockResolvedValue(undefined);

			// Need to re-import to pick up new mock value
			vi.resetModules();
			const { DELETE } = await import('../brands/[id]/+server');
			const response = await DELETE({ params: { id: 'test' } } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(mockRm).toHaveBeenCalledWith(
				expect.stringContaining('test'),
				{ recursive: true, force: true }
			);
		});

		it('should return success with cloud mode indicator in cloud mode', async () => {
			mockAppMode = 'cloud';

			vi.resetModules();
			const { DELETE } = await import('../brands/[id]/+server');
			const response = await DELETE({ params: { id: 'test' } } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.mode).toBe('cloud');
		});

		it('should remove entire brand directory recursively', async () => {
			mockAppMode = 'local';
			mockAccess.mockResolvedValue(undefined);
			mockRm.mockResolvedValue(undefined);

			vi.resetModules();
			const { DELETE } = await import('../brands/[id]/+server');
			await DELETE({ params: { id: 'test' } } as any);

			expect(mockRm).toHaveBeenCalledWith(
				expect.any(String),
				expect.objectContaining({ recursive: true })
			);
		});

		it('should return 500 on deletion error', async () => {
			mockAppMode = 'local';
			mockAccess.mockResolvedValue(undefined);
			mockRm.mockRejectedValue(new Error('Delete error'));

			vi.resetModules();
			const { DELETE } = await import('../brands/[id]/+server');
			const response = await DELETE({ params: { id: 'test' } } as any);

			expect(response.status).toBe(500);
		});
	});
});
