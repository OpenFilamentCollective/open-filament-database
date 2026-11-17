/**
 * Tests for the theme store.
 *
 * Verifies the cycle (light → dark → system → light), localStorage
 * persistence, and DOM-class application based on system preference.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';

// All mocks need to be installed BEFORE the import below, since theme.ts
// reads matchMedia at module-init. vi.hoisted runs before imports.
const setup = vi.hoisted(() => {
	const localStore: Record<string, string> = {};
	const localStorageMock = {
		getItem: (key: string) => localStore[key] ?? null,
		setItem: (key: string, value: string) => {
			localStore[key] = value;
		},
		removeItem: (key: string) => {
			delete localStore[key];
		},
		clear: () => {
			for (const k of Object.keys(localStore)) delete localStore[k];
		}
	};
	const matchMediaMock = (_query: string) => ({
		matches: false,
		addEventListener: () => {},
		removeEventListener: () => {}
	});

	// Install on globalThis BEFORE imports execute (vi.hoisted runs first)
	Object.defineProperty(globalThis, 'localStorage', {
		value: localStorageMock,
		writable: true,
		configurable: true
	});
	Object.defineProperty(globalThis, 'matchMedia', {
		value: matchMediaMock,
		writable: true,
		configurable: true
	});
	if (typeof window !== 'undefined') {
		Object.defineProperty(window, 'matchMedia', {
			value: matchMediaMock,
			writable: true,
			configurable: true
		});
	}

	return { localStorageMock, matchMediaMock, localStore };
});

vi.mock('$app/environment', () => ({ browser: true }));

import { theme } from '../theme';
import { STORAGE_KEY_THEME } from '$lib/config/storageKeys';

function setSystemPrefersDark(prefersDark: boolean) {
	const impl = (_q: string) => ({
		matches: prefersDark,
		addEventListener: () => {},
		removeEventListener: () => {}
	});
	(globalThis as any).matchMedia = impl;
	(globalThis.window as any).matchMedia = impl;
}

describe('theme store', () => {
	beforeEach(() => {
		// Wipe storage and DOM class so each test starts clean
		setup.localStorageMock.clear();
		document.documentElement.classList.remove('dark');
		setSystemPrefersDark(false);
		theme.setTheme('system');
	});

	describe('setTheme', () => {
		it('persists the theme to localStorage', () => {
			theme.setTheme('dark');
			expect(setup.localStore[STORAGE_KEY_THEME]).toBe('dark');
			expect(get(theme)).toBe('dark');
		});

		it('adds the .dark class when setting dark', () => {
			theme.setTheme('dark');
			expect(document.documentElement.classList.contains('dark')).toBe(true);
		});

		it('removes the .dark class when setting light', () => {
			document.documentElement.classList.add('dark');
			theme.setTheme('light');
			expect(document.documentElement.classList.contains('dark')).toBe(false);
		});

		it('applies system preference (dark) when setting system', () => {
			setSystemPrefersDark(true);
			theme.setTheme('system');
			expect(document.documentElement.classList.contains('dark')).toBe(true);
		});

		it('applies system preference (light) when setting system', () => {
			setSystemPrefersDark(false);
			theme.setTheme('system');
			expect(document.documentElement.classList.contains('dark')).toBe(false);
		});
	});

	describe('toggle', () => {
		it('cycles light → dark → system → light', () => {
			theme.setTheme('light');
			expect(get(theme)).toBe('light');

			theme.toggle();
			expect(get(theme)).toBe('dark');

			theme.toggle();
			expect(get(theme)).toBe('system');

			theme.toggle();
			expect(get(theme)).toBe('light');
		});

		it('persists each cycle step to localStorage', () => {
			theme.setTheme('light');

			theme.toggle();
			expect(setup.localStore[STORAGE_KEY_THEME]).toBe('dark');
			theme.toggle();
			expect(setup.localStore[STORAGE_KEY_THEME]).toBe('system');
			theme.toggle();
			expect(setup.localStore[STORAGE_KEY_THEME]).toBe('light');
		});

		it('applies the new theme to the DOM during toggle', () => {
			theme.setTheme('light');
			expect(document.documentElement.classList.contains('dark')).toBe(false);

			theme.toggle(); // -> dark
			expect(document.documentElement.classList.contains('dark')).toBe(true);

			theme.toggle(); // -> system (default light)
			expect(document.documentElement.classList.contains('dark')).toBe(false);
		});
	});
});
