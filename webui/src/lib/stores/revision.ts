/**
 * The pull request currently loaded into the editor for revision.
 *
 * Loading a PR (`revisionStore.load`) replaces the pending change set with the PR's changes,
 * rebuilt by the server on top of current main, and remembers the PR's feedback so the
 * entity pages can show it. Submitting then goes to `/api/submissions/[pr]/revise`, which
 * pushes onto the PR (open) or opens a replacement (returned); see ChangesMenu.svelte.
 */
import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';
import { STORAGE_KEY_ACTIVE_REVISION } from '$lib/config/storageKeys';
import { changeStore } from '$lib/stores/changes';
import { valueAtPointer } from '$lib/utils/jsonPointer';
import type {
	FeedbackItem,
	PrChangesResponse,
	PrKind,
	ReviseAccessInfo
} from '$lib/types/feedback';

export interface ActiveRevision {
	prNumber: number;
	prUrl: string;
	title: string;
	kind: PrKind;
	/** `amend`: push onto the open PR. `resubmit`: open a new PR replacing a returned one. */
	mode: 'amend' | 'resubmit';
	as: 'submitter' | 'maintainer';
	via: 'bot' | 'user-token';
	/** The PR head the change set was rebuilt from; a push is refused if the branch moved. */
	headSha: string;
	uuid: string | null;
	feedback: FeedbackItem[];
	conflicts: { entityPath: string; pointer: string }[];
	/**
	 * Each located feedback item's value when the PR was loaded, keyed by item id, so a
	 * banner can tell the contributor which ones they have since changed.
	 */
	baseline: Record<string, unknown>;
	loadedAt: string;
	/** Loaded from a development snapshot (/api/dev/preview/<pr>): nothing can be submitted. */
	preview?: boolean;
	/** Feedback items the contributor marked as dealt with (a fix the app can't see, or "it's right"). */
	done?: string[];
	/**
	 * The contributor's comments on fields, for the reviewers: entity path → JSON pointer →
	 * text. Posted on the matching lines of the pull request when the revision is submitted.
	 */
	notes?: Record<string, Record<string, string>>;
}

export interface FieldNote {
	entityPath: string;
	pointer: string;
	text: string;
}

function read(): ActiveRevision | null {
	if (!browser) return null;
	try {
		const raw = localStorage.getItem(STORAGE_KEY_ACTIVE_REVISION);
		return raw ? (JSON.parse(raw) as ActiveRevision) : null;
	} catch {
		return null;
	}
}

function write(value: ActiveRevision | null) {
	if (!browser) return;
	try {
		if (value) localStorage.setItem(STORAGE_KEY_ACTIVE_REVISION, JSON.stringify(value));
		else localStorage.removeItem(STORAGE_KEY_ACTIVE_REVISION);
	} catch {
		// Storage full or blocked: the revision still works for this page view.
	}
}

export type LoadResult =
	| { ok: true; revision: ActiveRevision }
	| { ok: false; error: string; access?: ReviseAccessInfo; status: number };

/** The entity data a feedback item's pointer is relative to, from the loaded change set. */
function dataFor(response: PrChangesResponse, entityPath: string): unknown {
	const change = response.changes.find((c) => c.entity.path === entityPath);
	return change ? (change.data ?? change.originalData) : undefined;
}

function createRevisionStore() {
	const { subscribe, set } = writable<ActiveRevision | null>(read());

	return {
		subscribe,

		/**
		 * Load PR `prNumber` into the editor. Replaces any pending changes, so callers must
		 * confirm with the user first when there are some.
		 */
		async load(prNumber: number): Promise<LoadResult> {
			let response: Response;
			try {
				response = await fetch(`/api/submissions/${prNumber}/changes`);
			} catch {
				return { ok: false, error: 'Could not reach the server.', status: 0 };
			}
			const body = await response.json().catch(() => ({}));
			if (!response.ok) {
				return {
					ok: false,
					error: body.error || 'Failed to load the pull request.',
					access: body.access,
					status: response.status
				};
			}
			const data = body as PrChangesResponse;
			if (!data.access?.allowed || !data.access.mode || !data.access.as || !data.access.via) {
				return {
					ok: false,
					error: data.access?.reason || 'You cannot revise this pull request.',
					access: data.access,
					status: 403
				};
			}

			await changeStore.loadRevision(data.changes, data.images);

			const baseline: Record<string, unknown> = {};
			for (const item of data.feedback) {
				const loc = item.location;
				if (loc?.entityPath && loc.pointer) {
					baseline[item.id] = valueAtPointer(dataFor(data, loc.entityPath), loc.pointer);
				}
			}

			const revision: ActiveRevision = {
				prNumber: data.prNumber,
				prUrl: data.url,
				title: data.title,
				kind: data.kind,
				mode: data.access.mode,
				as: data.access.as,
				via: data.access.via,
				headSha: data.headSha,
				uuid: data.uuid,
				feedback: data.feedback,
				conflicts: data.conflicts,
				baseline,
				loadedAt: new Date().toISOString(),
				preview: data.preview === true
			};
			set(revision);
			write(revision);
			return { ok: true, revision };
		},

		/** Mark a feedback item as dealt with, or not. */
		setDone(itemId: string, done: boolean) {
			const current = get({ subscribe });
			if (!current) return;
			const ids = new Set(current.done ?? []);
			if (done) ids.add(itemId);
			else ids.delete(itemId);
			const next = { ...current, done: [...ids] };
			set(next);
			write(next);
		},

		/** Set (or, with empty text, remove) the contributor's comment on a field. */
		setNote(entityPath: string, pointer: string, text: string) {
			const current = get({ subscribe });
			if (!current) return;
			const notes = { ...(current.notes ?? {}) };
			const forEntity = { ...(notes[entityPath] ?? {}) };
			if (text.trim()) forEntity[pointer] = text;
			else delete forEntity[pointer];
			if (Object.keys(forEntity).length) notes[entityPath] = forEntity;
			else delete notes[entityPath];
			const next = { ...current, notes };
			set(next);
			write(next);
		},

		/** Every comment, flat, for submitting. */
		notesList(): FieldNote[] {
			const notes = get({ subscribe })?.notes ?? {};
			return Object.entries(notes).flatMap(([entityPath, byPointer]) =>
				Object.entries(byPointer).map(([pointer, text]) => ({ entityPath, pointer, text }))
			);
		},

		/** Stop revising. With `discardChanges`, also drop the loaded changes from the editor. */
		clear(opts: { discardChanges?: boolean } = {}) {
			if (opts.discardChanges) changeStore.clear();
			set(null);
			write(null);
		},

		get(): ActiveRevision | null {
			return get({ subscribe });
		}
	};
}

export const revisionStore = createRevisionStore();

export const isRevising = derived(revisionStore, ($r) => $r !== null);

/** Feedback items about `entityPath` itself (not its children). */
export function feedbackForEntity(
	revision: ActiveRevision | null,
	entityPath: string
): FeedbackItem[] {
	if (!revision) return [];
	return revision.feedback.filter((item) => item.location?.entityPath === entityPath);
}

/** Feedback items not tied to any entity (conversation comments, review bodies). */
export function generalFeedback(revision: ActiveRevision | null): FeedbackItem[] {
	if (!revision) return [];
	return revision.feedback.filter((item) => !item.location?.entityPath);
}

/**
 * Whether the contributor has changed the value a feedback item points at since loading.
 * `current` is the entity's pending data (or null when it has no pending change).
 */
export function changedSinceLoaded(
	revision: ActiveRevision,
	item: FeedbackItem,
	current: unknown
): boolean {
	const pointer = item.location?.pointer;
	if (!pointer || !(item.id in revision.baseline)) return false;
	// No pending data (the change was undone or cleared) is not a fix.
	if (current == null) return false;
	const now = valueAtPointer(current, pointer);
	return JSON.stringify(now) !== JSON.stringify(revision.baseline[item.id]);
}

/** The pending (editor) data for an entity, or null when it has no pending change. */
export function pendingData(entityPath: string): unknown {
	return get(changeStore)._index.get(entityPath)?.change?.data ?? null;
}

/**
 * Whether a feedback item has been dealt with: marked done, or the field it is about has
 * changed since the PR was loaded. `current` is the entity's data as the editor has it.
 */
export function isAddressed(
	revision: ActiveRevision,
	item: FeedbackItem,
	current: unknown
): boolean {
	return (revision.done ?? []).includes(item.id) || changedSinceLoaded(revision, item, current);
}
