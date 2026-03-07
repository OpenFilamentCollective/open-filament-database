/**
 * Client-side auth store for GitHub and SimplyPrint OAuth state
 */

import { writable, derived } from 'svelte/store';

interface GitHubUser {
	login: string;
	name: string;
	avatar_url: string;
}

interface SimplyPrintUser {
	id: number;
	name: string;
	email: string;
	company_name: string;
}

interface AuthState {
	ghAuthenticated: boolean;
	ghUser: GitHubUser | null;
	ghLoading: boolean;
	spAuthenticated: boolean;
	spUser: SimplyPrintUser | null;
	spLoading: boolean;
}

function createAuthStore() {
	const { subscribe, set, update } = writable<AuthState>({
		ghAuthenticated: false,
		ghUser: null,
		ghLoading: false,
		spAuthenticated: false,
		spUser: null,
		spLoading: false
	});

	return {
		subscribe,

		async checkGitHubStatus() {
			update((s) => ({ ...s, ghLoading: true }));
			try {
				const response = await fetch('/api/auth/github/status');
				const data = await response.json();
				update((s) => ({
					...s,
					ghAuthenticated: data.authenticated,
					ghUser: data.user || null,
					ghLoading: false
				}));
			} catch {
				update((s) => ({ ...s, ghAuthenticated: false, ghUser: null, ghLoading: false }));
			}
		},

		ghLogin() {
			localStorage.setItem('ofd_reopen_wizard', 'github');
			window.location.href = '/api/auth/github/login';
		},

		async ghLogout() {
			await fetch('/api/auth/github/logout', { method: 'POST' });
			update((s) => ({ ...s, ghAuthenticated: false, ghUser: null }));
		},

		async checkSpStatus() {
			update((s) => ({ ...s, spLoading: true }));
			try {
				const response = await fetch('/api/auth/simplyprint/status');
				const data = await response.json();
				update((s) => ({
					...s,
					spAuthenticated: data.authenticated,
					spUser: data.user || null,
					spLoading: false
				}));
			} catch {
				update((s) => ({ ...s, spAuthenticated: false, spUser: null, spLoading: false }));
			}
		},

		spLogin() {
			localStorage.setItem('ofd_reopen_wizard', 'simplyprint');
			window.location.href = '/api/auth/simplyprint/login';
		},

		async spLogout() {
			await fetch('/api/auth/simplyprint/logout', { method: 'POST' });
			update((s) => ({ ...s, spAuthenticated: false, spUser: null }));
		},

		// Legacy compat: check both statuses
		async checkStatus() {
			update((s) => ({ ...s, ghLoading: true, spLoading: true }));
			try {
				const [ghRes, spRes] = await Promise.all([
					fetch('/api/auth/github/status'),
					fetch('/api/auth/simplyprint/status')
				]);
				const [ghData, spData] = await Promise.all([ghRes.json(), spRes.json()]);
				set({
					ghAuthenticated: ghData.authenticated,
					ghUser: ghData.user || null,
					ghLoading: false,
					spAuthenticated: spData.authenticated,
					spUser: spData.user || null,
					spLoading: false
				});
			} catch {
				set({
					ghAuthenticated: false,
					ghUser: null,
					ghLoading: false,
					spAuthenticated: false,
					spUser: null,
					spLoading: false
				});
			}
		},

		// Legacy compat
		login() {
			this.ghLogin();
		},
		async logout() {
			await this.ghLogout();
		}
	};
}

export const authStore = createAuthStore();

// GitHub derived stores
export const isAuthenticated = derived(authStore, ($s) => $s.ghAuthenticated);
export const currentUser = derived(authStore, ($s) => $s.ghUser);

// SimplyPrint derived stores
export const isSpAuthenticated = derived(authStore, ($s) => $s.spAuthenticated);
export const currentSpUser = derived(authStore, ($s) => $s.spUser);
