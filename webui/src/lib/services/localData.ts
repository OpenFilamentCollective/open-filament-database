/**
 * Local data management.
 *
 * Clears all browser-persisted working data (pending changes, cached images,
 * submitted-changes archive, clipboard, transient flags, …) while preserving
 * user settings. "Settings" is defined by SETTINGS_STORAGE_KEYS — every other
 * localStorage key is removed, and the IndexedDB image cache is dropped too.
 */
import { browser } from '$app/environment';
import * as imageDb from '$lib/services/imageDb';
import { SETTINGS_STORAGE_KEYS } from '$lib/config/storageKeys';

/**
 * Remove all localStorage entries except the settings allowlist, and clear the
 * IndexedDB image store. Resolves once the image store has been cleared.
 */
export async function clearLocalDataExceptSettings(): Promise<void> {
	if (!browser) return;

	const preserve = new Set<string>(SETTINGS_STORAGE_KEYS);

	// Snapshot keys first — removing entries mid-iteration shifts indices.
	const keys: string[] = [];
	for (let i = 0; i < localStorage.length; i++) {
		const key = localStorage.key(i);
		if (key !== null) keys.push(key);
	}

	for (const key of keys) {
		if (!preserve.has(key)) {
			localStorage.removeItem(key);
		}
	}

	// Cached images live in IndexedDB, not localStorage — clear them separately.
	await imageDb.clearAll();
}
