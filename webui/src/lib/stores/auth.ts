/**
 * Client-side auth store for GitHub OAuth state
 */

import { writable, derived } from 'svelte/store';

interface AuthState {
	authenticated: boolean;
	user: { login: string; name: string; avatar_url: string } | null;
	loading: boolean;
}

function createAuthStore() {
	const { subscribe, set, update } = writable<AuthState>({
		authenticated: false,
		user: null,
		loading: false
	});

	return {
		subscribe,

		async checkStatus() {
			update((s) => ({ ...s, loading: true }));
			try {
				const response = await fetch('/api/auth/github/status');
				const data = await response.json();
				set({
					authenticated: data.authenticated,
					user: data.user || null,
					loading: false
				});
			} catch {
				set({ authenticated: false, user: null, loading: false });
			}
		},

		login() {
			window.location.href = '/api/auth/github/login';
		},

		async logout() {
			await fetch('/api/auth/github/logout', { method: 'POST' });
			set({ authenticated: false, user: null, loading: false });
		}
	};
}

export const authStore = createAuthStore();
export const isAuthenticated = derived(authStore, ($store) => $store.authenticated);
export const currentUser = derived(authStore, ($store) => $store.user);
