/**
 * Tests for the auth store.
 *
 * Covers status checks, login redirects, and logout for both GitHub and
 * SimplyPrint OAuth flows. CLAUDE.md flagged auth as a 0%-coverage gap.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';

vi.mock('$app/environment', () => ({ browser: true }));

const localStorageMock = (() => {
	let store: Record<string, string> = {};
	return {
		getItem: vi.fn((key: string) => store[key] ?? null),
		setItem: vi.fn((key: string, value: string) => {
			store[key] = value;
		}),
		removeItem: vi.fn((key: string) => {
			delete store[key];
		}),
		clear: vi.fn(() => {
			store = {};
		})
	};
})();
Object.defineProperty(globalThis, 'localStorage', {
	value: localStorageMock,
	writable: true
});

// Allow tests to overwrite window.location.href
const locationMock = { href: '' };
Object.defineProperty(globalThis.window, 'location', {
	value: locationMock,
	writable: true
});

import {
	authStore,
	isAuthenticated,
	currentUser,
	isSpAuthenticated,
	currentSpUser
} from '../auth';
import { STORAGE_KEY_REOPEN_WIZARD } from '$lib/config/storageKeys';

describe('authStore', () => {
	const fetchMock = vi.fn();

	beforeEach(() => {
		fetchMock.mockReset();
		vi.stubGlobal('fetch', fetchMock);
		localStorageMock.clear();
		localStorageMock.setItem.mockClear();
		locationMock.href = '';
	});

	describe('initial state', () => {
		it('starts unauthenticated and not loading', () => {
			const state = get(authStore);
			expect(state.ghAuthenticated).toBe(false);
			expect(state.ghUser).toBeNull();
			expect(state.spAuthenticated).toBe(false);
			expect(state.spUser).toBeNull();
		});

		it('derived isAuthenticated reflects ghAuthenticated', () => {
			expect(get(isAuthenticated)).toBe(false);
		});

		it('derived currentUser reflects ghUser', () => {
			expect(get(currentUser)).toBeNull();
		});
	});

	describe('checkGitHubStatus', () => {
		it('sets ghAuthenticated and user from /api/auth/github/status response', async () => {
			fetchMock.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						authenticated: true,
						user: { login: 'octocat', name: 'Octo Cat', avatar_url: 'https://example.com/avatar' }
					}),
					{ status: 200 }
				)
			);

			await authStore.checkGitHubStatus();

			expect(fetchMock).toHaveBeenCalledWith('/api/auth/github/status');
			const state = get(authStore);
			expect(state.ghAuthenticated).toBe(true);
			expect(state.ghUser?.login).toBe('octocat');
			expect(state.ghLoading).toBe(false);
		});

		it('handles unauthenticated response', async () => {
			fetchMock.mockResolvedValueOnce(
				new Response(JSON.stringify({ authenticated: false }), { status: 200 })
			);

			await authStore.checkGitHubStatus();

			const state = get(authStore);
			expect(state.ghAuthenticated).toBe(false);
			expect(state.ghUser).toBeNull();
		});

		it('resets to unauthenticated when fetch throws', async () => {
			fetchMock.mockRejectedValueOnce(new Error('network'));

			await authStore.checkGitHubStatus();

			const state = get(authStore);
			expect(state.ghAuthenticated).toBe(false);
			expect(state.ghUser).toBeNull();
			expect(state.ghLoading).toBe(false);
		});
	});

	describe('ghLogin', () => {
		it('sets the reopen-wizard marker and redirects to the login URL', () => {
			authStore.ghLogin();

			expect(localStorageMock.setItem).toHaveBeenCalledWith(STORAGE_KEY_REOPEN_WIZARD, 'github');
			expect(locationMock.href).toBe('/api/auth/github/login');
		});
	});

	describe('ghLogout', () => {
		it('POSTs to /api/auth/github/logout and clears the auth state', async () => {
			// First simulate being logged in
			fetchMock.mockResolvedValueOnce(
				new Response(JSON.stringify({ authenticated: true, user: { login: 'octocat' } }), {
					status: 200
				})
			);
			await authStore.checkGitHubStatus();
			expect(get(authStore).ghAuthenticated).toBe(true);

			// Then logout
			fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
			await authStore.ghLogout();

			expect(fetchMock).toHaveBeenLastCalledWith('/api/auth/github/logout', { method: 'POST' });
			const state = get(authStore);
			expect(state.ghAuthenticated).toBe(false);
			expect(state.ghUser).toBeNull();
		});
	});

	describe('checkSpStatus', () => {
		it('populates SimplyPrint user from the status endpoint', async () => {
			fetchMock.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						authenticated: true,
						user: {
							id: 1,
							name: 'User',
							email: 'u@example.com',
							company_name: 'Co',
							avatar_url: 'https://example.com/a'
						}
					}),
					{ status: 200 }
				)
			);

			await authStore.checkSpStatus();

			expect(fetchMock).toHaveBeenCalledWith('/api/auth/simplyprint/status');
			const state = get(authStore);
			expect(state.spAuthenticated).toBe(true);
			expect(state.spUser?.email).toBe('u@example.com');
		});

		it('clears state on fetch failure', async () => {
			fetchMock.mockRejectedValueOnce(new Error('network'));
			await authStore.checkSpStatus();
			const state = get(authStore);
			expect(state.spAuthenticated).toBe(false);
			expect(state.spUser).toBeNull();
		});
	});

	describe('spLogin', () => {
		it('redirects to the SimplyPrint login URL with the reopen marker set', () => {
			authStore.spLogin();
			expect(localStorageMock.setItem).toHaveBeenCalledWith(
				STORAGE_KEY_REOPEN_WIZARD,
				'simplyprint'
			);
			expect(locationMock.href).toBe('/api/auth/simplyprint/login');
		});
	});

	describe('spLogout', () => {
		it('POSTs to the SimplyPrint logout endpoint and clears state', async () => {
			fetchMock.mockResolvedValueOnce(
				new Response(JSON.stringify({ authenticated: true, user: { id: 1 } }), { status: 200 })
			);
			await authStore.checkSpStatus();

			fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
			await authStore.spLogout();

			expect(fetchMock).toHaveBeenLastCalledWith('/api/auth/simplyprint/logout', {
				method: 'POST'
			});
			const state = get(authStore);
			expect(state.spAuthenticated).toBe(false);
			expect(state.spUser).toBeNull();
		});
	});

	describe('checkStatus (combined)', () => {
		it('fetches both GitHub and SimplyPrint status in parallel', async () => {
			fetchMock
				.mockResolvedValueOnce(
					new Response(
						JSON.stringify({ authenticated: true, user: { login: 'gh-user' } }),
						{ status: 200 }
					)
				)
				.mockResolvedValueOnce(
					new Response(JSON.stringify({ authenticated: true, user: { id: 7 } }), {
						status: 200
					})
				);

			await authStore.checkStatus();

			const urls = fetchMock.mock.calls.map((c) => c[0]);
			expect(urls).toContain('/api/auth/github/status');
			expect(urls).toContain('/api/auth/simplyprint/status');

			const state = get(authStore);
			expect(state.ghAuthenticated).toBe(true);
			expect(state.spAuthenticated).toBe(true);
		});

		it('falls back to all-cleared state when either call fails', async () => {
			fetchMock.mockRejectedValueOnce(new Error('network'));
			await authStore.checkStatus();
			const state = get(authStore);
			expect(state.ghAuthenticated).toBe(false);
			expect(state.spAuthenticated).toBe(false);
		});
	});

	describe('legacy aliases', () => {
		it('login() delegates to ghLogin', () => {
			authStore.login();
			expect(localStorageMock.setItem).toHaveBeenCalledWith(STORAGE_KEY_REOPEN_WIZARD, 'github');
			expect(locationMock.href).toBe('/api/auth/github/login');
		});

		it('logout() delegates to ghLogout', async () => {
			fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
			await authStore.logout();
			expect(fetchMock).toHaveBeenLastCalledWith('/api/auth/github/logout', { method: 'POST' });
		});
	});

	describe('derived stores', () => {
		it('isSpAuthenticated and currentSpUser track SimplyPrint state', async () => {
			expect(get(isSpAuthenticated)).toBe(false);
			expect(get(currentSpUser)).toBeNull();

			fetchMock.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						authenticated: true,
						user: { id: 1, name: 'X', email: '', company_name: '', avatar_url: '' }
					}),
					{ status: 200 }
				)
			);
			await authStore.checkSpStatus();
			expect(get(isSpAuthenticated)).toBe(true);
			expect(get(currentSpUser)?.id).toBe(1);
		});
	});
});
