import '@testing-library/jest-dom/vitest';
import { vi, beforeEach } from 'vitest';

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
		get length() {
			return Object.keys(store).length;
		},
		key: vi.fn((index: number) => Object.keys(store)[index] || null),
		// Test helpers
		_getStore: () => ({ ...store }),
		_setStore: (newStore: Record<string, string>) => {
			store = { ...newStore };
		},
		_reset: () => {
			store = {};
			localStorageMock.getItem.mockClear();
			localStorageMock.setItem.mockClear();
			localStorageMock.removeItem.mockClear();
			localStorageMock.clear.mockClear();
		}
	};
})();

Object.defineProperty(globalThis, 'localStorage', {
	value: localStorageMock,
	writable: true
});

// Mock fetch
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

// Reset mocks before each test
beforeEach(() => {
	localStorageMock._reset();
	mockFetch.mockReset();
});

// Export for use in tests
export { localStorageMock, mockFetch };
