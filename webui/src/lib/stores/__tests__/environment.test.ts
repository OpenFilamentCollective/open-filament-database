import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';

// Mock localStorage
const localStorageMock = (() => {
	let store: Record<string, string> = {};
	return {
		getItem: vi.fn((key: string) => store[key] || null),
		setItem: vi.fn((key: string, value: string) => {
			store[key] = value;
		}),
		removeItem: vi.fn((key: string) => {
			delete store[key];
		}),
		clear: vi.fn(() => {
			store = {};
		}),
		_setStore: (newStore: Record<string, string>) => {
			store = { ...newStore };
		}
	};
})();

Object.defineProperty(globalThis, 'localStorage', {
	value: localStorageMock,
	writable: true
});

// Mock env values that will be modified per test
let mockAppMode = 'local';
let mockApiBaseUrl = '';

vi.mock('$app/environment', () => ({
	browser: true
}));

vi.mock('$env/dynamic/public', () => ({
	env: {
		get PUBLIC_APP_MODE() {
			return mockAppMode;
		},
		get PUBLIC_API_BASE_URL() {
			return mockApiBaseUrl;
		}
	}
}));

describe('Environment Store', () => {
	beforeEach(() => {
		mockAppMode = 'local';
		mockApiBaseUrl = '';
		localStorageMock.clear();
		localStorageMock._setStore({});
		localStorageMock.getItem.mockClear();
		vi.resetModules();
	});

	describe('detectEnvironment', () => {
		it('should default to local mode', async () => {
			mockAppMode = '';

			const { environment } = await import('../environment');
			expect(get(environment)).toBe('local');
		});

		it('should return cloud when PUBLIC_APP_MODE is "cloud"', async () => {
			mockAppMode = 'cloud';

			const { environment } = await import('../environment');
			expect(get(environment)).toBe('cloud');
		});

		it('should respect localStorage FORCE_CLOUD_MODE override', async () => {
			mockAppMode = 'local';
			localStorageMock._setStore({ FORCE_CLOUD_MODE: 'true' });

			const { environment } = await import('../environment');
			expect(get(environment)).toBe('cloud');
		});

		it('should handle case-insensitive mode', async () => {
			mockAppMode = 'CLOUD';

			const { environment } = await import('../environment');
			expect(get(environment)).toBe('cloud');
		});
	});

	describe('derived stores', () => {
		it('isLocalMode should be true when environment is local', async () => {
			mockAppMode = 'local';

			const { isLocalMode } = await import('../environment');
			expect(get(isLocalMode)).toBe(true);
		});

		it('isCloudMode should be true when environment is cloud', async () => {
			mockAppMode = 'cloud';

			const { isCloudMode } = await import('../environment');
			expect(get(isCloudMode)).toBe(true);
		});
	});

	describe('getApiBaseUrl', () => {
		it('should return empty string in local mode', async () => {
			mockAppMode = 'local';
			mockApiBaseUrl = '';

			const { apiBaseUrl } = await import('../environment');
			expect(get(apiBaseUrl)).toBe('');
		});

		it('should return configured URL in cloud mode', async () => {
			mockAppMode = 'cloud';
			mockApiBaseUrl = 'https://api.example.com';

			const { apiBaseUrl } = await import('../environment');
			expect(get(apiBaseUrl)).toBe('https://api.example.com');
		});

		it('should use default API URL if not configured', async () => {
			mockAppMode = 'cloud';
			mockApiBaseUrl = '';

			const { apiBaseUrl } = await import('../environment');
			expect(get(apiBaseUrl)).toBe('https://api.openfilamentdatabase.org');
		});

		it('should remove trailing slash', async () => {
			mockAppMode = 'cloud';
			mockApiBaseUrl = 'https://api.example.com/';

			const { apiBaseUrl } = await import('../environment');
			expect(get(apiBaseUrl)).toBe('https://api.example.com');
		});
	});

});
