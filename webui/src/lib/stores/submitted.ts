import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';
import type {
	EntityChange,
	SubmittedEntry,
	SubmittedBuffer,
	SubmissionStatus
} from '$lib/types/changes';
import { STORAGE_KEY_SUBMITTED } from '$lib/config/storageKeys';
import { datasetVisibleAfter } from '$lib/config/datasetSchedule';

const DEFAULT_TTL_DAYS = 7;

function createEmptyBuffer(): SubmittedBuffer {
	return { entries: {}, version: 1 };
}

/** Entries written before `status` existed predate any reconcile, so they are still open. */
function statusOf(entry: SubmittedEntry): SubmissionStatus {
	return entry.status ?? 'open';
}

/** True while the PR is still in review — the case an amend can be offered for. */
function isOpen(entry: SubmittedEntry): boolean {
	const status = statusOf(entry);
	return status === 'open' || status === 'changes_requested';
}

/**
 * True once a merged entry's data can be expected to have reached the upstream API, so the
 * overlay copy is redundant and should be dropped. Open/closed entries are not stale by this
 * measure — open ones are still pending, and closed ones are removed outright.
 */
function isMergedAndPublished(entry: SubmittedEntry, now: number): boolean {
	if (statusOf(entry) !== 'merged') return false;
	// A merged entry with no timestamp can't be aged; the TTL still evicts it.
	if (!entry.mergedAt) return false;
	return datasetVisibleAfter(entry.mergedAt).getTime() <= now;
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
					// Evict expired entries on load, plus merged ones upstream has published.
					const now = Date.now();
					for (const [uuid, entry] of Object.entries(parsed.entries)) {
						if (new Date(entry.expiresAt).getTime() <= now || isMergedAndPublished(entry, now)) {
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

	/** Drop merged entries the nightly rebuild has published. Returns true if anything went. */
	function evictPublishedFrom(buffer: SubmittedBuffer): boolean {
		const now = Date.now();
		let changed = false;
		for (const [uuid, entry] of Object.entries(buffer.entries)) {
			if (isMergedAndPublished(entry, now)) {
				delete buffer.entries[uuid];
				changed = true;
			}
		}
		return changed;
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
				paths: lightChanges.map((c) => c.entity.path),
				status: 'open'
			};

			update((buffer) => {
				buffer.entries[params.uuid] = entry;
				rebuildIndex(buffer);
				persist(buffer);
				return buffer;
			});
		},

		/**
		 * Reconcile tracked submissions against GitHub's real PR state.
		 *
		 * Asks the server for the current status of each tracked PR (which checks GitHub for
		 * anything the merge webhook may have missed) and records it on the entry.
		 *
		 * A **closed** PR is dropped immediately — its data is never coming.
		 *
		 * A **merged** PR is deliberately *kept*, marked `merged` with the merge time, until
		 * the nightly dataset rebuild has plausibly published it (`datasetVisibleAfter`).
		 * Merging does not make the change visible upstream — the API is rebuilt once a day —
		 * so dropping the overlay at merge time makes the contributor's own work disappear
		 * from their view. That is what produced the duplicate submissions in #442 and #460.
		 *
		 * Safe to call on load; no-ops with no entries.
		 */
		async reconcile(): Promise<void> {
			if (!browser) return;

			const entries = Object.values(get({ subscribe }).entries);
			const prNumbers = entries.map((e) => e.prNumber).filter((n) => n > 0);
			if (prNumbers.length === 0) return;

			let statuses: Record<number, string>;
			let mergedAt: Record<number, string | null> = {};
			try {
				const res = await fetch('/api/submissions/status', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ prNumbers })
				});
				if (!res.ok) return;
				const payload = await res.json();
				statuses = payload.statuses;
				mergedAt = payload.mergedAt ?? {};
			} catch {
				return; // Network/offline — leave entries as-is.
			}

			const now = new Date().toISOString();

			update((buffer) => {
				let changed = false;
				for (const entry of Object.values(buffer.entries)) {
					const status = statuses[entry.prNumber] as SubmissionStatus | 'unknown' | undefined;
					if (!status || status === 'unknown') continue;

					if (status === 'closed') {
						delete buffer.entries[entry.uuid];
						changed = true;
						continue;
					}

					if (status === 'merged') {
						// Prefer GitHub's merge time; fall back to first observation, which is
						// close enough given reconcile runs whenever the menu mounts.
						const merged = mergedAt[entry.prNumber] ?? entry.mergedAt ?? now;
						if (entry.status !== 'merged' || entry.mergedAt !== merged) {
							entry.status = 'merged';
							entry.mergedAt = merged;
							changed = true;
						}
						continue;
					}

					if (entry.status !== status) {
						entry.status = status;
						changed = true;
					}
				}

				// A merged entry whose data has since been published upstream is redundant.
				if (evictPublishedFrom(buffer)) changed = true;

				if (changed) {
					rebuildIndex(buffer);
					persist(buffer);
				}
				return buffer;
			});
		},

		/**
		 * Entries whose PR is still in review, newest first — the candidates for amending
		 * rather than opening a competing PR.
		 */
		openEntries(): SubmittedEntry[] {
			const buffer = get({ subscribe });
			return Object.values(buffer.entries)
				.filter(isOpen)
				.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
		},

		/**
		 * Which still-open submissions already touch any of `paths`. Opening a second PR over
		 * these is what causes the out-of-order merges and hand-resolved conflicts this store
		 * exists to prevent, so the submit flow offers to amend instead.
		 *
		 * A path counts as overlapping when it matches an in-flight path exactly, or is an
		 * ancestor/descendant of one — editing a filament that is in review conflicts with the
		 * PR that created it just as much as re-editing the filament itself does.
		 */
		findOverlap(paths: string[]): Array<{ entry: SubmittedEntry; paths: string[] }> {
			if (paths.length === 0) return [];
			const results: Array<{ entry: SubmittedEntry; paths: string[] }> = [];

			for (const entry of this.openEntries()) {
				const inFlight = entry.paths;
				const hits = paths.filter((p) =>
					inFlight.some(
						(q) => p === q || p.startsWith(q + '/') || q.startsWith(p + '/')
					)
				);
				if (hits.length > 0) results.push({ entry, paths: hits });
			}

			return results;
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

		/** Evict entries past their TTL, plus merged ones the upstream API has since published. */
		evictExpired() {
			const now = Date.now();
			update((buffer) => {
				let changed = false;
				for (const [uuid, entry] of Object.entries(buffer.entries)) {
					if (new Date(entry.expiresAt).getTime() <= now || isMergedAndPublished(entry, now)) {
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

		/** Look up one submission by UUID. */
		getEntry(uuid: string): SubmittedEntry | undefined {
			return get({ subscribe }).entries[uuid];
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
