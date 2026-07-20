import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';
import type { EntityChange, SubmittedEntry, SubmittedBuffer } from '$lib/types/changes';
import { STORAGE_KEY_SUBMITTED } from '$lib/config/storageKeys';

const DEFAULT_TTL_DAYS = 7;

function createEmptyBuffer(): SubmittedBuffer {
	return { entries: {}, version: 1 };
}

/** Build a path-to-change index from all entries (newest submission wins). */
function buildIndex(
	buffer: SubmittedBuffer
): Map<string, { change: EntityChange; entry: SubmittedEntry }> {
	const index = new Map<string, { change: EntityChange; entry: SubmittedEntry }>();

	// Sort entries by submittedAt ascending so newest overwrites oldest
	const sorted = Object.values(buffer.entries).sort(
		(a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime()
	);

	for (const entry of sorted) {
		for (const change of entry.changes) {
			index.set(change.entity.path, { change, entry });
		}
	}

	return index;
}

function createSubmittedStore() {
	let _index = new Map<string, { change: EntityChange; entry: SubmittedEntry }>();

	const initial = loadFromStorage();
	_index = buildIndex(initial);

	const { subscribe, set, update } = writable<SubmittedBuffer>(initial);

	function loadFromStorage(): SubmittedBuffer {
		if (!browser) return createEmptyBuffer();

		try {
			const stored = localStorage.getItem(STORAGE_KEY_SUBMITTED);
			if (stored) {
				const parsed: SubmittedBuffer = JSON.parse(stored);
				if (parsed.version === 1) {
					// Evict expired entries on load
					const now = Date.now();
					for (const [uuid, entry] of Object.entries(parsed.entries)) {
						if (new Date(entry.expiresAt).getTime() <= now) {
							delete parsed.entries[uuid];
						}
					}
					persist(parsed);
					return parsed;
				}
			}
		} catch (e) {
			console.error('Failed to load submitted buffer from localStorage:', e);
		}

		return createEmptyBuffer();
	}

	function persist(buffer: SubmittedBuffer) {
		if (!browser) return;
		try {
			localStorage.setItem(STORAGE_KEY_SUBMITTED, JSON.stringify(buffer));
		} catch (e) {
			console.error('Failed to persist submitted buffer:', e);
		}
	}

	function rebuildIndex(buffer: SubmittedBuffer) {
		_index = buildIndex(buffer);
	}

	return {
		subscribe,

		/**
		 * Archive a submission's changes into the buffer.
		 * Called after successful PR creation, before changeStore.clear().
		 */
		archive(params: {
			uuid: string;
			prUrl: string;
			prNumber: number;
			changes: EntityChange[];
			ttlDays?: number;
		}) {
			const ttl = params.ttlDays ?? DEFAULT_TTL_DAYS;
			const now = new Date();
			const expiresAt = new Date(now.getTime() + ttl * 24 * 60 * 60 * 1000).toISOString();

			// Strip originalData and propertyChanges to save space
			const lightChanges = params.changes.map((c) => ({
				entity: c.entity,
				operation: c.operation,
				data: c.data,
				timestamp: c.timestamp,
				description: c.description
			}));

			const entry: SubmittedEntry = {
				uuid: params.uuid,
				prUrl: params.prUrl,
				prNumber: params.prNumber,
				submittedAt: now.toISOString(),
				expiresAt,
				changes: lightChanges,
				paths: lightChanges.map((c) => c.entity.path)
			};

			update((buffer) => {
				buffer.entries[params.uuid] = entry;
				rebuildIndex(buffer);
				persist(buffer);
				return buffer;
			});
		},

		/**
		 * Merge in-review submissions restored from an account-backed overlay (the
		 * SimplyPrint embed). Unlike {@link archive}, this preserves the original
		 * submission time, never overwrites an entry already tracked locally, and
		 * gives the entry a far-future expiry — an in-review PR can easily outlive
		 * the default 7-day TTL, and here the SimplyPrint account (plus the server
		 * reconciler) own pruning once the PR merges/closes. Without this rehydrate,
		 * a fresh browser/device or an expired local entry leaves the submitted set
		 * empty, so the next embed autosave would post an empty overlay and wipe the
		 * account draft. Returns true if anything new was added.
		 */
		importInReview(
			entries: Array<{
				prNumber?: number;
				prUrl?: string;
				submittedAt?: string;
				changes?: EntityChange[];
			}>
		): boolean {
			if (!browser || !Array.isArray(entries)) return false;
			let added = false;
			const FAR_FUTURE_DAYS = 3650;

			update((buffer) => {
				// PRs already tracked locally (possibly under a different uuid, e.g. the
				// random one from the original submit on this device) — never duplicate.
				const trackedPrNumbers = new Set(
					Object.values(buffer.entries)
						.map((x) => x.prNumber)
						.filter((n) => n > 0)
				);

				for (const e of entries) {
					const changes = Array.isArray(e?.changes) ? e.changes : [];
					if (!changes.length) continue;

					const prNumber = Number(e?.prNumber) || 0;
					if (prNumber > 0 && trackedPrNumbers.has(prNumber)) continue;

					// Stable id per PR so re-restoring the same draft is idempotent.
					const uuid =
						prNumber > 0
							? `acct-pr-${prNumber}`
							: `acct-${e?.submittedAt ?? ''}-${changes.length}`;
					if (buffer.entries[uuid]) continue; // already tracked locally

					const submittedAt = e?.submittedAt || new Date().toISOString();
					const lightChanges = changes.map((c) => ({
						entity: c.entity,
						operation: c.operation,
						data: c.data,
						timestamp: c.timestamp,
						description: c.description
					}));

					buffer.entries[uuid] = {
						uuid,
						prUrl: e?.prUrl || '',
						prNumber,
						submittedAt,
						expiresAt: new Date(
							Date.now() + FAR_FUTURE_DAYS * 24 * 60 * 60 * 1000
						).toISOString(),
						changes: lightChanges,
						paths: lightChanges.map((c) => c.entity.path)
					};
					if (prNumber > 0) trackedPrNumbers.add(prNumber);
					added = true;
				}
				if (added) {
					rebuildIndex(buffer);
					persist(buffer);
				}
				return buffer;
			});

			return added;
		},

		/**
		 * Reconcile tracked submissions against GitHub's real PR state.
		 * Asks the server for the current status of each tracked PR (which checks
		 * GitHub for anything the merge webhook may have missed) and drops entries
		 * whose PR is merged or closed. Safe to call on load; no-ops with no entries.
		 */
		async reconcile(): Promise<void> {
			if (!browser) return;

			const entries = Object.values(get({ subscribe }).entries);
			const prNumbers = entries.map((e) => e.prNumber).filter((n) => n > 0);
			if (prNumbers.length === 0) return;

			let statuses: Record<number, string>;
			try {
				const res = await fetch('/api/submissions/status', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ prNumbers })
				});
				if (!res.ok) return;
				({ statuses } = await res.json());
			} catch {
				return; // Network/offline — leave entries as-is.
			}

			update((buffer) => {
				let changed = false;
				for (const entry of Object.values(buffer.entries)) {
					const status = statuses[entry.prNumber];
					if (status === 'merged' || status === 'closed') {
						delete buffer.entries[entry.uuid];
						changed = true;
					}
				}
				if (changed) {
					rebuildIndex(buffer);
					persist(buffer);
				}
				return buffer;
			});
		},

		/** Remove a specific submission by UUID. */
		remove(uuid: string) {
			update((buffer) => {
				delete buffer.entries[uuid];
				rebuildIndex(buffer);
				persist(buffer);
				return buffer;
			});
		},

		/** Evict expired entries. */
		evictExpired() {
			const now = Date.now();
			update((buffer) => {
				let changed = false;
				for (const [uuid, entry] of Object.entries(buffer.entries)) {
					if (new Date(entry.expiresAt).getTime() <= now) {
						delete buffer.entries[uuid];
						changed = true;
					}
				}
				if (changed) {
					rebuildIndex(buffer);
					persist(buffer);
				}
				return buffer;
			});
		},

		/** Get the submitted change for a specific entity path (newest wins). */
		getChange(path: string): { change: EntityChange; entry: SubmittedEntry } | undefined {
			return _index.get(path);
		},

		/** Check if an entity path has a submitted change. */
		has(path: string): boolean {
			return _index.has(path);
		},

		/**
		 * Get direct child submitted changes for a path prefix.
		 * Prefix should end with "/" (e.g. "brands/" or "brands/foo/materials/").
		 */
		getDirectChildChanges(
			prefix: string
		): Array<{ entityId: string; change: EntityChange }> {
			const results: Array<{ entityId: string; change: EntityChange }> = [];

			for (const [path, { change }] of _index) {
				if (!path.startsWith(prefix)) continue;
				// Check it's a direct child (no further nesting after prefix)
				const rest = path.slice(prefix.length);
				if (!rest.includes('/')) {
					results.push({ entityId: rest, change });
				}
			}

			return results;
		},

		/** Check if any descendant of a path has submitted changes. */
		hasDescendantChanges(path: string): boolean {
			const prefix = path + '/';
			for (const p of _index.keys()) {
				if (p.startsWith(prefix)) return true;
			}
			return false;
		},

		/** Get all entries (for ChangesMenu display). Sorted newest first. */
		getEntries(): SubmittedEntry[] {
			const buffer = get({ subscribe });
			return Object.values(buffer.entries).sort(
				(a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
			);
		},

		/** Total number of submitted changes across all entries. */
		getTotalChangeCount(): number {
			return _index.size;
		},

		/** Clear all submitted entries. */
		clear() {
			if (!browser) return;
			set(createEmptyBuffer());
			_index = new Map();
			localStorage.removeItem(STORAGE_KEY_SUBMITTED);
		}
	};
}

export const submittedStore = createSubmittedStore();

export const submittedCount = derived(submittedStore, () =>
	submittedStore.getTotalChangeCount()
);

export const hasSubmitted = derived(submittedCount, ($count) => $count > 0);
