import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import type { EntityChange } from '$lib/types/changes';

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
		_getStore: () => ({ ...store }),
		_setStore: (newStore: Record<string, string>) => {
			store = { ...newStore };
		}
	};
})();

Object.defineProperty(globalThis, 'localStorage', {
	value: localStorageMock,
	writable: true
});

// Import after the localStorage mock is in place so the module's load-from-storage
// path uses our stubbed implementation.
import { submittedStore, submittedCount, hasSubmitted } from '../submitted';
import { STORAGE_KEY_SUBMITTED } from '$lib/config/storageKeys';

function makeChange(path: string, id: string, type: EntityChange['entity']['type'] = 'brand'): EntityChange {
	return {
		entity: { type, id, path },
		operation: 'update',
		data: { id, name: id },
		originalData: { id, name: 'old-' + id },
		timestamp: Date.now(),
		description: `Updated ${id}`
	};
}

describe('Submitted Store', () => {
	beforeEach(() => {
		localStorageMock.clear();
		localStorageMock._setStore({});
		localStorageMock.getItem.mockClear();
		localStorageMock.setItem.mockClear();
		localStorageMock.removeItem.mockClear();
		submittedStore.clear();
	});

	describe('archive', () => {
		it('archives a submission to the buffer', () => {
			const change = makeChange('brands/acme', 'acme');
			submittedStore.archive({
				uuid: 'sub-1',
				prUrl: 'https://github.com/foo/bar/pull/42',
				prNumber: 42,
				changes: [change]
			});

			expect(submittedStore.has('brands/acme')).toBe(true);
			const result = submittedStore.getChange('brands/acme');
			expect(result?.change.entity.id).toBe('acme');
			expect(result?.entry.prNumber).toBe(42);
			expect(result?.entry.uuid).toBe('sub-1');
		});

		it('persists the archive to localStorage', () => {
			const change = makeChange('brands/acme', 'acme');
			submittedStore.archive({
				uuid: 'sub-1',
				prUrl: 'https://example.com/pr/1',
				prNumber: 1,
				changes: [change]
			});

			const raw = localStorageMock.getItem(STORAGE_KEY_SUBMITTED);
			expect(raw).toBeTruthy();
			const parsed = JSON.parse(raw!);
			expect(parsed.version).toBe(1);
			expect(parsed.entries['sub-1']).toBeDefined();
			expect(parsed.entries['sub-1'].paths).toEqual(['brands/acme']);
		});

		it('strips originalData and propertyChanges when archiving', () => {
			const change: EntityChange = {
				...makeChange('brands/acme', 'acme'),
				originalData: { id: 'acme', name: 'OldName' },
				propertyChanges: [
					{ property: 'name', oldValue: 'OldName', newValue: 'acme', timestamp: Date.now() }
				]
			};
			submittedStore.archive({
				uuid: 'sub-1',
				prUrl: 'https://example.com/pr/1',
				prNumber: 1,
				changes: [change]
			});

			const stored = submittedStore.getChange('brands/acme');
			expect(stored?.change.operation).toBe('update');
			expect(stored?.change.data).toEqual({ id: 'acme', name: 'acme' });
			// These should be omitted in the light copy
			expect((stored?.change as any).originalData).toBeUndefined();
			expect((stored?.change as any).propertyChanges).toBeUndefined();
		});

		it('uses default TTL of 7 days', () => {
			const change = makeChange('brands/acme', 'acme');
			const before = Date.now();
			submittedStore.archive({
				uuid: 'sub-1',
				prUrl: 'https://example.com/pr/1',
				prNumber: 1,
				changes: [change]
			});

			const entry = submittedStore.getEntries()[0];
			const submittedAt = new Date(entry.submittedAt).getTime();
			const expiresAt = new Date(entry.expiresAt).getTime();
			const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
			expect(expiresAt - submittedAt).toBeGreaterThanOrEqual(sevenDaysMs - 1000);
			expect(expiresAt - submittedAt).toBeLessThanOrEqual(sevenDaysMs + 1000);
			expect(submittedAt).toBeGreaterThanOrEqual(before);
		});

		it('respects custom ttlDays', () => {
			const change = makeChange('brands/acme', 'acme');
			submittedStore.archive({
				uuid: 'sub-1',
				prUrl: 'https://example.com/pr/1',
				prNumber: 1,
				changes: [change],
				ttlDays: 3
			});

			const entry = submittedStore.getEntries()[0];
			const submittedAt = new Date(entry.submittedAt).getTime();
			const expiresAt = new Date(entry.expiresAt).getTime();
			const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
			expect(expiresAt - submittedAt).toBeGreaterThanOrEqual(threeDaysMs - 1000);
			expect(expiresAt - submittedAt).toBeLessThanOrEqual(threeDaysMs + 1000);
		});

		it('newest submission wins for the same entity path', async () => {
			const olderChange: EntityChange = {
				...makeChange('brands/acme', 'acme'),
				data: { id: 'acme', name: 'First' }
			};
			submittedStore.archive({
				uuid: 'sub-1',
				prUrl: 'https://example.com/pr/1',
				prNumber: 1,
				changes: [olderChange]
			});

			// Sleep a tick so submittedAt timestamps differ measurably
			await new Promise((r) => setTimeout(r, 5));

			const newerChange: EntityChange = {
				...makeChange('brands/acme', 'acme'),
				data: { id: 'acme', name: 'Second' }
			};
			submittedStore.archive({
				uuid: 'sub-2',
				prUrl: 'https://example.com/pr/2',
				prNumber: 2,
				changes: [newerChange]
			});

			const result = submittedStore.getChange('brands/acme');
			expect(result?.change.data.name).toBe('Second');
			expect(result?.entry.prNumber).toBe(2);
		});
	});

	describe('remove', () => {
		it('removes a submission by UUID', () => {
			submittedStore.archive({
				uuid: 'sub-1',
				prUrl: 'https://example.com/pr/1',
				prNumber: 1,
				changes: [makeChange('brands/acme', 'acme')]
			});
			expect(submittedStore.has('brands/acme')).toBe(true);

			submittedStore.remove('sub-1');

			expect(submittedStore.has('brands/acme')).toBe(false);
			expect(submittedStore.getEntries()).toHaveLength(0);
		});

		it('persists the removal to localStorage', () => {
			submittedStore.archive({
				uuid: 'sub-1',
				prUrl: 'https://example.com/pr/1',
				prNumber: 1,
				changes: [makeChange('brands/acme', 'acme')]
			});
			submittedStore.remove('sub-1');

			const raw = localStorageMock.getItem(STORAGE_KEY_SUBMITTED);
			expect(raw).toBeTruthy();
			const parsed = JSON.parse(raw!);
			expect(parsed.entries['sub-1']).toBeUndefined();
		});

		it('is a no-op when uuid does not exist', () => {
			expect(() => submittedStore.remove('does-not-exist')).not.toThrow();
		});
	});

	describe('evictExpired', () => {
		it('evicts entries whose expiresAt is in the past', () => {
			// Seed an expired entry directly into localStorage
			const expiredEntry = {
				uuid: 'sub-expired',
				prUrl: 'https://example.com/pr/old',
				prNumber: 99,
				submittedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString(),
				expiresAt: new Date(Date.now() - 1000 * 60).toISOString(), // 1 minute ago
				changes: [makeChange('brands/old', 'old')],
				paths: ['brands/old']
			};

			submittedStore.archive({
				uuid: 'sub-current',
				prUrl: 'https://example.com/pr/new',
				prNumber: 100,
				changes: [makeChange('brands/new', 'new')]
			});

			// Inject the expired entry via the underlying writable
			const current = get(submittedStore);
			current.entries['sub-expired'] = expiredEntry;
			localStorageMock.setItem(STORAGE_KEY_SUBMITTED, JSON.stringify(current));
			// Re-archive to trigger an index rebuild that includes expiredEntry
			submittedStore.archive({
				uuid: 'sub-expired',
				prUrl: 'https://example.com/pr/old',
				prNumber: 99,
				changes: [makeChange('brands/old', 'old')]
			});

			// Force the entry's expiresAt to be in the past
			const buffer = get(submittedStore);
			buffer.entries['sub-expired'].expiresAt = new Date(Date.now() - 1000).toISOString();

			submittedStore.evictExpired();

			expect(submittedStore.has('brands/old')).toBe(false);
			expect(submittedStore.has('brands/new')).toBe(true);
		});

		it('is a no-op when nothing is expired', () => {
			submittedStore.archive({
				uuid: 'sub-1',
				prUrl: 'https://example.com/pr/1',
				prNumber: 1,
				changes: [makeChange('brands/acme', 'acme')]
			});
			const before = submittedStore.getEntries().length;
			submittedStore.evictExpired();
			expect(submittedStore.getEntries().length).toBe(before);
		});

		it('evicts on initial load when buffer is read from localStorage', async () => {
			vi.resetModules();
			const expiredBuffer = {
				version: 1,
				entries: {
					'sub-old': {
						uuid: 'sub-old',
						prUrl: 'https://example.com/old',
						prNumber: 1,
						submittedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString(),
						expiresAt: new Date(Date.now() - 1000).toISOString(),
						changes: [makeChange('brands/old', 'old')],
						paths: ['brands/old']
					},
					'sub-new': {
						uuid: 'sub-new',
						prUrl: 'https://example.com/new',
						prNumber: 2,
						submittedAt: new Date().toISOString(),
						expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(),
						changes: [makeChange('brands/new', 'new')],
						paths: ['brands/new']
					}
				}
			};
			localStorageMock._setStore({
				[STORAGE_KEY_SUBMITTED]: JSON.stringify(expiredBuffer)
			});

			const fresh = await import('../submitted');
			expect(fresh.submittedStore.has('brands/old')).toBe(false);
			expect(fresh.submittedStore.has('brands/new')).toBe(true);
		});
	});

	describe('lookups', () => {
		it('getChange returns undefined for unknown path', () => {
			expect(submittedStore.getChange('brands/unknown')).toBeUndefined();
		});

		it('has returns false for unknown path', () => {
			expect(submittedStore.has('brands/unknown')).toBe(false);
		});

		it('getDirectChildChanges returns only direct children', () => {
			submittedStore.archive({
				uuid: 'sub-1',
				prUrl: 'https://example.com/pr/1',
				prNumber: 1,
				changes: [
					makeChange('brands/acme', 'acme', 'brand'),
					makeChange('brands/foo', 'foo', 'brand'),
					makeChange('brands/acme/materials/pla', 'pla', 'material'),
					makeChange('brands/acme/materials/pla/filaments/basic', 'basic', 'filament')
				]
			});

			const directBrands = submittedStore.getDirectChildChanges('brands/');
			expect(directBrands).toHaveLength(2);
			const ids = directBrands.map((c) => c.entityId).sort();
			expect(ids).toEqual(['acme', 'foo']);

			const directMaterials = submittedStore.getDirectChildChanges('brands/acme/materials/');
			expect(directMaterials).toHaveLength(1);
			expect(directMaterials[0].entityId).toBe('pla');
		});

		it('hasDescendantChanges returns true when any descendant is submitted', () => {
			submittedStore.archive({
				uuid: 'sub-1',
				prUrl: 'https://example.com/pr/1',
				prNumber: 1,
				changes: [makeChange('brands/acme/materials/pla', 'pla', 'material')]
			});

			expect(submittedStore.hasDescendantChanges('brands/acme')).toBe(true);
			expect(submittedStore.hasDescendantChanges('brands/foo')).toBe(false);
		});

		it('hasDescendantChanges does not consider the entity itself as a descendant', () => {
			submittedStore.archive({
				uuid: 'sub-1',
				prUrl: 'https://example.com/pr/1',
				prNumber: 1,
				changes: [makeChange('brands/acme', 'acme')]
			});

			// brands/acme is not a descendant of brands/acme, only its children would be
			expect(submittedStore.hasDescendantChanges('brands/acme')).toBe(false);
		});
	});

	describe('getEntries', () => {
		it('returns entries sorted newest first', async () => {
			submittedStore.archive({
				uuid: 'sub-old',
				prUrl: 'https://example.com/pr/1',
				prNumber: 1,
				changes: [makeChange('brands/a', 'a')]
			});
			await new Promise((r) => setTimeout(r, 5));
			submittedStore.archive({
				uuid: 'sub-new',
				prUrl: 'https://example.com/pr/2',
				prNumber: 2,
				changes: [makeChange('brands/b', 'b')]
			});

			const entries = submittedStore.getEntries();
			expect(entries[0].uuid).toBe('sub-new');
			expect(entries[1].uuid).toBe('sub-old');
		});

		it('returns empty array when no submissions', () => {
			expect(submittedStore.getEntries()).toEqual([]);
		});
	});

	describe('getTotalChangeCount', () => {
		it('returns the size of the path index', () => {
			expect(submittedStore.getTotalChangeCount()).toBe(0);

			submittedStore.archive({
				uuid: 'sub-1',
				prUrl: 'https://example.com/pr/1',
				prNumber: 1,
				changes: [makeChange('brands/a', 'a'), makeChange('brands/b', 'b')]
			});
			expect(submittedStore.getTotalChangeCount()).toBe(2);

			submittedStore.archive({
				uuid: 'sub-2',
				prUrl: 'https://example.com/pr/2',
				prNumber: 2,
				changes: [makeChange('brands/c', 'c')]
			});
			expect(submittedStore.getTotalChangeCount()).toBe(3);
		});

		it('overlapping paths are counted once (newest wins)', async () => {
			submittedStore.archive({
				uuid: 'sub-1',
				prUrl: 'https://example.com/pr/1',
				prNumber: 1,
				changes: [makeChange('brands/a', 'a')]
			});
			await new Promise((r) => setTimeout(r, 5));
			submittedStore.archive({
				uuid: 'sub-2',
				prUrl: 'https://example.com/pr/2',
				prNumber: 2,
				changes: [makeChange('brands/a', 'a')]
			});

			expect(submittedStore.getTotalChangeCount()).toBe(1);
		});
	});

	describe('clear', () => {
		it('clears all entries and removes the localStorage key', () => {
			submittedStore.archive({
				uuid: 'sub-1',
				prUrl: 'https://example.com/pr/1',
				prNumber: 1,
				changes: [makeChange('brands/a', 'a')]
			});
			expect(submittedStore.getTotalChangeCount()).toBe(1);

			submittedStore.clear();

			expect(submittedStore.getTotalChangeCount()).toBe(0);
			expect(submittedStore.getEntries()).toEqual([]);
			expect(localStorageMock.removeItem).toHaveBeenCalledWith(STORAGE_KEY_SUBMITTED);
		});
	});

	describe('derived stores', () => {
		it('submittedCount reflects archive size', () => {
			expect(get(submittedCount)).toBe(0);
			submittedStore.archive({
				uuid: 'sub-1',
				prUrl: 'https://example.com/pr/1',
				prNumber: 1,
				changes: [makeChange('brands/a', 'a'), makeChange('brands/b', 'b')]
			});
			expect(get(submittedCount)).toBe(2);
		});

		it('hasSubmitted is true when count > 0', () => {
			expect(get(hasSubmitted)).toBe(false);
			submittedStore.archive({
				uuid: 'sub-1',
				prUrl: 'https://example.com/pr/1',
				prNumber: 1,
				changes: [makeChange('brands/a', 'a')]
			});
			expect(get(hasSubmitted)).toBe(true);
			submittedStore.clear();
			expect(get(hasSubmitted)).toBe(false);
		});
	});

	describe('reconcile', () => {
		function mockStatus(statuses: Record<number, string>, mergedAt: Record<number, string> = {}) {
			return vi.fn(async () => ({
				ok: true,
				json: async () => ({ statuses, mergedAt })
			})) as unknown as typeof fetch;
		}

		beforeEach(() => {
			vi.unstubAllGlobals();
		});

		it('drops a closed submission immediately', async () => {
			submittedStore.archive({
				uuid: 'sub-1',
				prUrl: 'https://example.com/pr/1',
				prNumber: 1,
				changes: [makeChange('brands/acme', 'acme')]
			});
			vi.stubGlobal('fetch', mockStatus({ 1: 'closed' }));

			await submittedStore.reconcile();

			expect(submittedStore.has('brands/acme')).toBe(false);
		});

		it('keeps a merged submission until the nightly rebuild has published it', async () => {
			// The bug this guards: PR #459 merged, the overlay dropped it, the upstream API
			// (rebuilt once a day) still lacked it, so the contributor re-created the filament
			// in #460. A merged entry must stay visible until the next build has run.
			submittedStore.archive({
				uuid: 'sub-1',
				prUrl: 'https://example.com/pr/459',
				prNumber: 459,
				changes: [makeChange('brands/3dhojor', '3dhojor')]
			});
			const justMerged = new Date().toISOString();
			vi.stubGlobal('fetch', mockStatus({ 459: 'merged' }, { 459: justMerged }));

			await submittedStore.reconcile();

			expect(submittedStore.has('brands/3dhojor')).toBe(true);
			const entry = submittedStore.getEntries()[0];
			expect(entry.status).toBe('merged');
			expect(entry.mergedAt).toBe(justMerged);
		});

		it('evicts a merged submission once the rebuild window has passed', async () => {
			submittedStore.archive({
				uuid: 'sub-1',
				prUrl: 'https://example.com/pr/1',
				prNumber: 1,
				changes: [makeChange('brands/acme', 'acme')]
			});
			// Merged two days ago — at least two nightly builds have run since.
			const longAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
			vi.stubGlobal('fetch', mockStatus({ 1: 'merged' }, { 1: longAgo }));

			await submittedStore.reconcile();

			expect(submittedStore.has('brands/acme')).toBe(false);
		});

		it('falls back to now when GitHub gives no merge timestamp', async () => {
			submittedStore.archive({
				uuid: 'sub-1',
				prUrl: 'https://example.com/pr/1',
				prNumber: 1,
				changes: [makeChange('brands/acme', 'acme')]
			});
			vi.stubGlobal('fetch', mockStatus({ 1: 'merged' }));

			await submittedStore.reconcile();

			// Still present (the fallback is "just now"), and stamped so it can age out later.
			expect(submittedStore.has('brands/acme')).toBe(true);
			expect(submittedStore.getEntries()[0].mergedAt).toBeTruthy();
		});

		it('records changes_requested without dropping the entry', async () => {
			submittedStore.archive({
				uuid: 'sub-1',
				prUrl: 'https://example.com/pr/1',
				prNumber: 1,
				changes: [makeChange('brands/acme', 'acme')]
			});
			vi.stubGlobal('fetch', mockStatus({ 1: 'changes_requested' }));

			await submittedStore.reconcile();

			expect(submittedStore.has('brands/acme')).toBe(true);
			expect(submittedStore.getEntries()[0].status).toBe('changes_requested');
		});

		it('leaves entries alone when the status endpoint fails', async () => {
			submittedStore.archive({
				uuid: 'sub-1',
				prUrl: 'https://example.com/pr/1',
				prNumber: 1,
				changes: [makeChange('brands/acme', 'acme')]
			});
			vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })) as unknown as typeof fetch);

			await submittedStore.reconcile();

			expect(submittedStore.has('brands/acme')).toBe(true);
		});

		it('ignores an unknown status', async () => {
			submittedStore.archive({
				uuid: 'sub-1',
				prUrl: 'https://example.com/pr/1',
				prNumber: 1,
				changes: [makeChange('brands/acme', 'acme')]
			});
			vi.stubGlobal('fetch', mockStatus({ 1: 'unknown' }));

			await submittedStore.reconcile();

			expect(submittedStore.has('brands/acme')).toBe(true);
			expect(submittedStore.getEntries()[0].status).toBe('open');
		});
	});

	describe('openEntries / findOverlap', () => {
		it('treats an entry with no recorded status as open', () => {
			submittedStore.archive({
				uuid: 'sub-1',
				prUrl: 'https://example.com/pr/1',
				prNumber: 1,
				changes: [makeChange('brands/acme', 'acme')]
			});
			expect(submittedStore.openEntries().map((e) => e.uuid)).toEqual(['sub-1']);
		});

		it('excludes merged entries from the amend candidates', async () => {
			submittedStore.archive({
				uuid: 'sub-1',
				prUrl: 'https://example.com/pr/1',
				prNumber: 1,
				changes: [makeChange('brands/acme', 'acme')]
			});
			vi.stubGlobal(
				'fetch',
				vi.fn(async () => ({
					ok: true,
					json: async () => ({
						statuses: { 1: 'merged' },
						mergedAt: { 1: new Date().toISOString() }
					})
				})) as unknown as typeof fetch
			);
			await submittedStore.reconcile();

			// Still layered over API data, but no longer something to amend.
			expect(submittedStore.has('brands/acme')).toBe(true);
			expect(submittedStore.openEntries()).toHaveLength(0);
			expect(submittedStore.findOverlap(['brands/acme'])).toEqual([]);
		});

		it('finds an exact path overlap', () => {
			submittedStore.archive({
				uuid: 'sub-1',
				prUrl: 'https://example.com/pr/459',
				prNumber: 459,
				changes: [makeChange('brands/3dhojor/materials/PLA/filaments/silk', 'silk', 'filament')]
			});

			const overlap = submittedStore.findOverlap([
				'brands/3dhojor/materials/PLA/filaments/silk'
			]);
			expect(overlap).toHaveLength(1);
			expect(overlap[0].entry.prNumber).toBe(459);
		});

		it('finds a descendant of an in-flight path', () => {
			// #461 added a variant under the filament #459 had just created.
			submittedStore.archive({
				uuid: 'sub-1',
				prUrl: 'https://example.com/pr/459',
				prNumber: 459,
				changes: [makeChange('brands/3dhojor/materials/PLA/filaments/silk', 'silk', 'filament')]
			});

			const overlap = submittedStore.findOverlap([
				'brands/3dhojor/materials/PLA/filaments/silk/variants/silk_blue_green'
			]);
			expect(overlap).toHaveLength(1);
		});

		it('finds an ancestor of an in-flight path', () => {
			submittedStore.archive({
				uuid: 'sub-1',
				prUrl: 'https://example.com/pr/1',
				prNumber: 1,
				changes: [
					makeChange(
						'brands/elegoo/materials/PLA/filaments/pla_metallic/variants/metallic_blue',
						'metallic_blue',
						'variant'
					)
				]
			});

			const overlap = submittedStore.findOverlap([
				'brands/elegoo/materials/PLA/filaments/pla_metallic'
			]);
			expect(overlap).toHaveLength(1);
		});

		it('does not match an unrelated sibling with a shared prefix', () => {
			submittedStore.archive({
				uuid: 'sub-1',
				prUrl: 'https://example.com/pr/1',
				prNumber: 1,
				changes: [makeChange('brands/acme', 'acme')]
			});

			// "brands/acme_two" starts with "brands/acme" as a string but is a different brand.
			expect(submittedStore.findOverlap(['brands/acme_two'])).toEqual([]);
		});

		it('reports only the overlapping paths, not the whole change set', () => {
			submittedStore.archive({
				uuid: 'sub-1',
				prUrl: 'https://example.com/pr/1',
				prNumber: 1,
				changes: [makeChange('brands/acme', 'acme')]
			});

			const overlap = submittedStore.findOverlap(['brands/acme', 'brands/other']);
			expect(overlap[0].paths).toEqual(['brands/acme']);
		});

		it('returns nothing for an empty path list', () => {
			expect(submittedStore.findOverlap([])).toEqual([]);
		});
	});

	describe('localStorage error handling', () => {
		it('survives a corrupted localStorage entry', async () => {
			vi.resetModules();
			localStorageMock._setStore({ [STORAGE_KEY_SUBMITTED]: 'not-valid-json' });

			// Suppress expected console.error from the load path
			const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

			const fresh = await import('../submitted');
			expect(fresh.submittedStore.getTotalChangeCount()).toBe(0);

			errorSpy.mockRestore();
		});

		it('ignores buffer with non-1 version', async () => {
			vi.resetModules();
			localStorageMock._setStore({
				[STORAGE_KEY_SUBMITTED]: JSON.stringify({ version: 2, entries: {} })
			});

			const fresh = await import('../submitted');
			expect(fresh.submittedStore.getTotalChangeCount()).toBe(0);
		});
	});
});
