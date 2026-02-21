import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';
import { PUBLIC_APP_MODE, PUBLIC_API_BASE_URL } from '$env/static/public';

/**
 * Detect if we're running in local mode or cloud mode
 * In local mode, we can directly save to the filesystem
 * In cloud mode, changes are stored in browser localStorage and can be exported
 */
function detectEnvironment(): 'local' | 'cloud' {
	// Use the PUBLIC_APP_MODE environment variable
	// Valid values are 'local' or 'cloud'
	const mode = PUBLIC_APP_MODE?.toLowerCase();

	// In browser, allow localStorage override for testing
	if (browser) {
		const forceMode = localStorage.getItem('FORCE_CLOUD_MODE');
		if (forceMode === 'true') {
			return 'cloud';
		}
	}

	// Default to environment variable, fallback to 'local'
	return mode === 'cloud' ? 'cloud' : 'local';
}

/**
 * Get the API base URL based on environment mode
 * In local mode: use local API endpoints (empty string for relative paths)
 * In cloud mode: use the configured external API URL
 */
function getApiBaseUrl(): string {
	const env = detectEnvironment();

	if (env === 'local') {
		// Local mode uses relative paths to local API endpoints
		return '';
	}

	// Cloud mode uses the configured external API URL
	// Default to the official API if not configured
	const apiUrl = PUBLIC_API_BASE_URL || 'https://api.openfilamentdatabase.org';

	// Remove trailing slash for consistency
	return apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;
}

export const environment = writable<'local' | 'cloud'>(detectEnvironment());
export const isLocalMode = derived(environment, ($env) => $env === 'local');
export const isCloudMode = derived(environment, ($env) => $env === 'cloud');
export const apiBaseUrl = writable<string>(getApiBaseUrl());

/**
 * Whether change tracking (localStorage staging) is enabled.
 * True in both local and cloud modes — decoupled from data source.
 */
export const useChangeTracking = derived(environment, () => true);

/**
 * Store for managing pending changes in cloud mode
 */
interface PendingChanges {
	[key: string]: any;
}

function createPendingChangesStore() {
	const { subscribe, set, update } = writable<PendingChanges>({});

	return {
		subscribe,
		addChange: (key: string, data: any) => {
			update((changes) => {
				changes[key] = data;
				// Persist to localStorage in cloud mode
				if (browser) {
					localStorage.setItem('pending_changes', JSON.stringify(changes));
				}
				return changes;
			});
		},
		clear: () => {
			set({});
			if (browser) {
				localStorage.removeItem('pending_changes');
			}
		},
		load: () => {
			if (browser) {
				const stored = localStorage.getItem('pending_changes');
				if (stored) {
					try {
						set(JSON.parse(stored));
					} catch (e) {
						console.error('Failed to load pending changes:', e);
					}
				}
			}
		}
	};
}

export const pendingChanges = createPendingChangesStore();
