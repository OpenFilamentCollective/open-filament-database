/**
 * Tests for clearLocalDataExceptSettings — wipes all localStorage working data
 * and the IndexedDB image cache while preserving the settings allowlist.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SETTINGS_STORAGE_KEYS } from '$lib/config/storageKeys';

vi.mock('$app/environment', () => ({ browser: true }));

const mocks = vi.hoisted(() => ({ clearAll: vi.fn(async () => {}) }));
vi.mock('$lib/services/imageDb', () => ({ clearAll: mocks.clearAll }));

import { clearLocalDataExceptSettings } from '../localData';

describe('clearLocalDataExceptSettings', () => {
	beforeEach(() => {
		localStorage.clear();
		mocks.clearAll.mockClear();
	});

	it('removes non-settings keys but preserves the settings allowlist', async () => {
		// Settings (should survive)
		localStorage.setItem('ofd_theme', 'dark');
		localStorage.setItem('ofd_welcome_dismissed', 'true');
		// Working data (should be wiped)
		localStorage.setItem('ofd_pending_changes', '{"version":2}');
		localStorage.setItem('ofd_submitted_changes', '[]');
		localStorage.setItem('ofd_user_prefs', '{"submissionUuids":[]}');
		localStorage.setItem('ofd_clipboard', '{}');
		// An unrelated key with no ofd_ prefix is still considered working data
		localStorage.setItem('some_other_key', 'x');

		await clearLocalDataExceptSettings();

		expect(localStorage.getItem('ofd_theme')).toBe('dark');
		expect(localStorage.getItem('ofd_welcome_dismissed')).toBe('true');
		expect(localStorage.getItem('ofd_pending_changes')).toBeNull();
		expect(localStorage.getItem('ofd_submitted_changes')).toBeNull();
		expect(localStorage.getItem('ofd_user_prefs')).toBeNull();
		expect(localStorage.getItem('ofd_clipboard')).toBeNull();
		expect(localStorage.getItem('some_other_key')).toBeNull();
	});

	it('clears the IndexedDB image cache', async () => {
		await clearLocalDataExceptSettings();
		expect(mocks.clearAll).toHaveBeenCalledTimes(1);
	});

	it('preserves exactly the keys in SETTINGS_STORAGE_KEYS', async () => {
		for (const key of SETTINGS_STORAGE_KEYS) localStorage.setItem(key, 'v');
		localStorage.setItem('ofd_pending_changes', 'data');

		await clearLocalDataExceptSettings();

		const remaining = new Set<string>();
		for (let i = 0; i < localStorage.length; i++) {
			const k = localStorage.key(i);
			if (k) remaining.add(k);
		}
		expect([...remaining].sort()).toEqual([...SETTINGS_STORAGE_KEYS].sort());
	});
});
