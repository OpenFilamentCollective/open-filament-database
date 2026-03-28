import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import { STORAGE_KEY_THEME } from '$lib/config/storageKeys';

type Theme = 'light' | 'dark' | 'system';

function getInitialTheme(): Theme {
	if (!browser) return 'system';

	const stored = localStorage.getItem(STORAGE_KEY_THEME);
	if (stored === 'light' || stored === 'dark' || stored === 'system') {
		return stored;
	}
	return 'system';
}

function getSystemPreference(): 'light' | 'dark' {
	if (!browser) return 'light';
	return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function createThemeStore() {
	const { subscribe, set, update } = writable<Theme>(getInitialTheme());

	function applyTheme(theme: Theme) {
		if (!browser) return;

		const effectiveTheme = theme === 'system' ? getSystemPreference() : theme;

		if (effectiveTheme === 'dark') {
			document.documentElement.classList.add('dark');
		} else {
			document.documentElement.classList.remove('dark');
		}
	}

	// Apply theme on initialization
	if (browser) {
		applyTheme(getInitialTheme());

		// Listen for system theme changes
		window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
			const currentTheme = localStorage.getItem(STORAGE_KEY_THEME) as Theme || 'system';
			if (currentTheme === 'system') {
				applyTheme('system');
			}
		});
	}

	return {
		subscribe,

		setTheme(theme: Theme) {
			if (browser) {
				localStorage.setItem(STORAGE_KEY_THEME, theme);
			}
			set(theme);
			applyTheme(theme);
		},

		toggle() {
			update((current) => {
				// Cycle through: light -> dark -> system -> light
				let newTheme: Theme;
				switch (current) {
					case 'light':
						newTheme = 'dark';
						break;
					case 'dark':
						newTheme = 'system';
						break;
					case 'system':
					default:
						newTheme = 'light';
						break;
				}

				if (browser) {
					localStorage.setItem(STORAGE_KEY_THEME, newTheme);
				}
				applyTheme(newTheme);
				return newTheme;
			});
		}
	};
}

export const theme = createThemeStore();
