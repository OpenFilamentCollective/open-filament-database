/**
 * Tests for the userPrefs store.
 *
 * Persists submission UUIDs (PR-creation receipts) to localStorage so the
 * user can see their submitted PRs across page reloads. Capped at 50.
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

import { userPrefs } from '../userPrefs';
import { STORAGE_KEY_USER_PREFS } from '$lib/config/storageKeys';

describe('userPrefs store', () => {
	beforeEach(() => {
		localStorageMock.clear();
		localStorageMock._setStore({});
		localStorageMock.setItem.mockClear();
		userPrefs.set({ submissionUuids: [] });
	});

	it('starts with an empty submissionUuids list', () => {
		expect(get(userPrefs).submissionUuids).toEqual([]);
	});

	describe('addSubmission', () => {
		it('records a submission with the supplied uuid/PR fields and a timestamp', () => {
			userPrefs.addSubmission('uuid-1', 'https://github.com/foo/bar/pull/42', 42);

			const submissions = get(userPrefs).submissionUuids;
			expect(submissions).toHaveLength(1);
			expect(submissions[0].uuid).toBe('uuid-1');
			expect(submissions[0].prUrl).toBe('https://github.com/foo/bar/pull/42');
			expect(submissions[0].prNumber).toBe(42);
			expect(new Date(submissions[0].submittedAt).getTime()).not.toBeNaN();
		});

		it('newest submissions are prepended to the list', () => {
			userPrefs.addSubmission('uuid-1', 'url-1', 1);
			userPrefs.addSubmission('uuid-2', 'url-2', 2);
			userPrefs.addSubmission('uuid-3', 'url-3', 3);

			const submissions = get(userPrefs).submissionUuids;
			expect(submissions.map((s) => s.uuid)).toEqual(['uuid-3', 'uuid-2', 'uuid-1']);
		});

		it('caps the list at 50 entries (drops the oldest)', () => {
			for (let i = 0; i < 60; i++) {
				userPrefs.addSubmission(`uuid-${i}`, `url-${i}`, i);
			}

			const submissions = get(userPrefs).submissionUuids;
			expect(submissions).toHaveLength(50);
			// Newest (uuid-59) at index 0
			expect(submissions[0].uuid).toBe('uuid-59');
			// Oldest still present: uuid-10
			expect(submissions[49].uuid).toBe('uuid-10');
		});

		it('persists the updated list to localStorage after each addSubmission', () => {
			userPrefs.addSubmission('uuid-1', 'url-1', 1);
			expect(localStorageMock.setItem).toHaveBeenCalledWith(
				STORAGE_KEY_USER_PREFS,
				expect.any(String)
			);
			const stored = localStorageMock.getItem(STORAGE_KEY_USER_PREFS);
			const parsed = JSON.parse(stored!);
			expect(parsed.submissionUuids[0].uuid).toBe('uuid-1');
		});
	});

	describe('getSubmissions', () => {
		it('returns the current submission list', () => {
			userPrefs.addSubmission('uuid-1', 'url-1', 1);
			userPrefs.addSubmission('uuid-2', 'url-2', 2);
			const submissions = userPrefs.getSubmissions();
			expect(submissions).toHaveLength(2);
			expect(submissions[0].uuid).toBe('uuid-2');
		});

		it('returns an empty array initially', () => {
			expect(userPrefs.getSubmissions()).toEqual([]);
		});
	});

	describe('persistence on load', () => {
		it('survives a corrupted localStorage value (falls back to defaults)', async () => {
			vi.resetModules();
			localStorageMock._setStore({ [STORAGE_KEY_USER_PREFS]: 'not-valid-json' });

			const fresh = await import('../userPrefs');
			expect(get(fresh.userPrefs).submissionUuids).toEqual([]);
		});

		it('merges stored prefs over defaults', async () => {
			vi.resetModules();
			localStorageMock._setStore({
				[STORAGE_KEY_USER_PREFS]: JSON.stringify({
					submissionUuids: [
						{ uuid: 'preloaded', prUrl: 'url', prNumber: 1, submittedAt: '2024-01-01T00:00:00Z' }
					]
				})
			});

			const fresh = await import('../userPrefs');
			const submissions = get(fresh.userPrefs).submissionUuids;
			expect(submissions).toHaveLength(1);
			expect(submissions[0].uuid).toBe('preloaded');
		});
	});
});
