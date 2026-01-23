import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fs module
const mockReaddir = vi.fn();
const mockReadFile = vi.fn();
const mockWriteFile = vi.fn();
const mockAccess = vi.fn();
const mockRm = vi.fn();

vi.mock('fs', () => ({
	promises: {
		readdir: (...args: any[]) => mockReaddir(...args),
		readFile: (...args: any[]) => mockReadFile(...args),
		writeFile: (...args: any[]) => mockWriteFile(...args),
		access: (...args: any[]) => mockAccess(...args),
		rm: (...args: any[]) => mockRm(...args)
	}
}));

// Mock $env/static/public
let mockAppMode = 'local';
vi.mock('$env/static/public', () => ({
	get PUBLIC_APP_MODE() {
		return mockAppMode;
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

describe('Stores API', () => {
	beforeEach(() => {
		mockReaddir.mockReset();
		mockReadFile.mockReset();
		mockWriteFile.mockReset();
		mockAccess.mockReset();
		mockRm.mockReset();
		mockAppMode = 'local';
	});

	describe('GET /api/stores', () => {
		it('should return list of all stores', async () => {
			mockReaddir.mockResolvedValue(['store1', 'store2']);
			mockReadFile
				.mockResolvedValueOnce(JSON.stringify({ id: 'store1', name: 'Store 1' }))
				.mockResolvedValueOnce(JSON.stringify({ id: 'store2', name: 'Store 2' }));

			const { GET } = await import('../stores/+server');
			const response = await GET({} as any);
			const data = await response.json();

			expect(data).toHaveLength(2);
			expect(data[0].name).toBe('Store 1');
			expect(data[1].name).toBe('Store 2');
		});

		it('should return empty array when no stores exist', async () => {
			mockReaddir.mockResolvedValue([]);

			const { GET } = await import('../stores/+server');
			const response = await GET({} as any);
			const data = await response.json();

			expect(data).toEqual([]);
		});

		it('should filter out directories without store.json', async () => {
			mockReaddir.mockResolvedValue(['store1', 'not-a-store']);
			mockReadFile
				.mockResolvedValueOnce(JSON.stringify({ id: 'store1', name: 'Store 1' }))
				.mockRejectedValueOnce(new Error('ENOENT'));

			const { GET } = await import('../stores/+server');
			const response = await GET({} as any);
			const data = await response.json();

			expect(data).toHaveLength(1);
			expect(data[0].id).toBe('store1');
		});

		it('should return 500 on filesystem error', async () => {
			mockReaddir.mockRejectedValue(new Error('Filesystem error'));

			const { GET } = await import('../stores/+server');
			const response = await GET({} as any);

			expect(response.status).toBe(500);
		});
	});

	describe('GET /api/stores/[id]', () => {
		it('should return store by ID', async () => {
			mockAccess.mockResolvedValue(undefined);
			mockReadFile.mockResolvedValue(JSON.stringify({ id: 'test', name: 'Test Store' }));

			const { GET } = await import('../stores/[id]/+server');
			const response = await GET({ params: { id: 'test' } } as any);
			const data = await response.json();

			expect(data.name).toBe('Test Store');
		});

		it('should normalize store ID (remove hyphens)', async () => {
			mockAccess
				.mockRejectedValueOnce(new Error('ENOENT')) // First try with hyphens fails
				.mockResolvedValueOnce(undefined); // Second try without hyphens succeeds
			mockReadFile.mockResolvedValue(JSON.stringify({ id: 'teststore', name: 'Test' }));

			const { GET } = await import('../stores/[id]/+server');
			await GET({ params: { id: 'test-store' } } as any);

			expect(mockReadFile).toHaveBeenCalled();
		});

		it('should return 404 for non-existent store', async () => {
			mockAccess.mockRejectedValue(new Error('ENOENT'));

			const { GET } = await import('../stores/[id]/+server');
			const response = await GET({ params: { id: 'non-existent' } } as any);

			expect(response.status).toBe(404);
		});
	});

	describe('PUT /api/stores/[id]', () => {
		it('should update existing store in local mode', async () => {
			mockAppMode = 'local';
			mockAccess.mockResolvedValue(undefined);
			mockWriteFile.mockResolvedValue(undefined);

			vi.resetModules();
			const store = { id: 'test', name: 'Updated Store' };
			const { PUT } = await import('../stores/[id]/+server');
			const response = await PUT({
				params: { id: 'test' },
				request: { json: async () => store }
			} as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(mockWriteFile).toHaveBeenCalled();
		});

		it('should return 400 on ID mismatch', async () => {
			mockAppMode = 'local';

			vi.resetModules();
			const store = { id: 'different', name: 'Store' };
			const { PUT } = await import('../stores/[id]/+server');
			const response = await PUT({
				params: { id: 'test' },
				request: { json: async () => store }
			} as any);

			expect(response.status).toBe(400);
		});

		it('should return success with cloud mode indicator in cloud mode', async () => {
			mockAppMode = 'cloud';

			vi.resetModules();
			const store = { id: 'test', name: 'Store' };
			const { PUT } = await import('../stores/[id]/+server');
			const response = await PUT({
				params: { id: 'test' },
				request: { json: async () => store }
			} as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(data.mode).toBe('cloud');
			expect(mockWriteFile).not.toHaveBeenCalled();
		});

		it('should format JSON with 4-space indentation', async () => {
			mockAppMode = 'local';
			mockAccess.mockResolvedValue(undefined);
			mockWriteFile.mockResolvedValue(undefined);

			vi.resetModules();
			const store = { id: 'test', name: 'Test' };
			const { PUT } = await import('../stores/[id]/+server');
			await PUT({
				params: { id: 'test' },
				request: { json: async () => store }
			} as any);

			const writtenContent = mockWriteFile.mock.calls[0][1];
			expect(writtenContent).toContain('    ');
			expect(writtenContent.endsWith('\n')).toBe(true);
		});

		it('should return 500 on write error', async () => {
			mockAppMode = 'local';
			mockAccess.mockResolvedValue(undefined);
			mockWriteFile.mockRejectedValue(new Error('Write error'));

			vi.resetModules();
			const { PUT } = await import('../stores/[id]/+server');
			const response = await PUT({
				params: { id: 'test' },
				request: { json: async () => ({ id: 'test' }) }
			} as any);

			expect(response.status).toBe(500);
		});
	});

	describe('DELETE /api/stores/[id]', () => {
		it('should delete store in local mode', async () => {
			mockAppMode = 'local';
			mockAccess.mockResolvedValue(undefined);
			mockRm.mockResolvedValue(undefined);

			vi.resetModules();
			const { DELETE } = await import('../stores/[id]/+server');
			const response = await DELETE({ params: { id: 'test' } } as any);
			const data = await response.json();

			expect(data.success).toBe(true);
			expect(mockRm).toHaveBeenCalledWith(
				expect.stringContaining('test'),
				{ recursive: true, force: true }
			);
		});

		it('should return 403 in cloud mode', async () => {
			mockAppMode = 'cloud';

			vi.resetModules();
			const { DELETE } = await import('../stores/[id]/+server');
			const response = await DELETE({ params: { id: 'test' } } as any);

			expect(response.status).toBe(403);
		});

		it('should remove entire store directory recursively', async () => {
			mockAppMode = 'local';
			mockAccess.mockResolvedValue(undefined);
			mockRm.mockResolvedValue(undefined);

			vi.resetModules();
			const { DELETE } = await import('../stores/[id]/+server');
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
			const { DELETE } = await import('../stores/[id]/+server');
			const response = await DELETE({ params: { id: 'test' } } as any);

			expect(response.status).toBe(500);
		});
	});
});
