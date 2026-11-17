/**
 * Delete Flow Composable
 *
 * Drives the one `<DeleteEntityModal>` a page renders. Every delete affordance on
 * the page — the detail entity's own dropdown and any child card in a list — calls
 * `open()` with a self-describing request, so the modal never reads page state and
 * the page needs no "which child am I deleting" flag.
 *
 * Detail pages navigate after a successful delete (to the replacement on a redirect,
 * to `navigateOnDelete` otherwise). Child cards pass `navigateOnDelete: null`, stay
 * put, and prune their list in `onSuccess`.
 */

import { goto } from '$app/navigation';
import { isLocallyCreated } from '$lib/services/entityService';
import { entityOps, opsForPath } from '$lib/services/entityRegistry';
import {
	redirectAndDelete,
	type RedirectSource,
	type RedirectTarget
} from '$lib/services/redirectService';
import type { createMessageHandler } from '$lib/utils/messageHandler.svelte';

export interface DeleteRequest extends RedirectSource {
	/** Overrides the registry's default cascade sentence. */
	cascadeWarning?: string;
	/** Where to go after a plain delete. `null` (child cards) stays on the page. */
	navigateOnDelete?: string | null;
	/** Runs on success, before any navigation — e.g. pruning the page's child list. */
	onSuccess?: () => void;
}

const NAVIGATE_DELAY_MS = 1500;

export function createDeleteFlow(
	messageHandler: ReturnType<typeof createMessageHandler>,
	navigateDelay = NAVIGATE_DELAY_MS
) {
	let request = $state<DeleteRequest | null>(null);
	let isLocalCreate = $state(false);
	let busy = $state(false);
	let error = $state<string | null>(null);
	let resolving = $state(false);
	/** Bumped per open() so a slow identity lookup can't land on a later request. */
	let openToken = 0;

	function open(req: DeleteRequest) {
		// Snapshot against the *source's* path: entityState.isLocalCreate is derived
		// from the page's own path and would be wrong for a child card.
		isLocalCreate = isLocallyCreated(req.path);
		error = null;

		const token = ++openToken;
		// List endpoints serve trimmed summaries with no `uuid`/`moved_from`, so a
		// child card can't say whether a redirect is possible. Fetch the real entity
		// before the modal decides. (A local create has no canonical UUID either way.)
		const shouldResolveIdentity = !req.uuid && !isLocalCreate;
		resolving = shouldResolveIdentity;
		request = req;
		if (shouldResolveIdentity) void resolveIdentity(req, token);
	}

	async function resolveIdentity(req: DeleteRequest, token: number) {
		const resolved = opsForPath(req.path);
		if (!resolved) {
			if (token === openToken) resolving = false;
			return;
		}

		resolving = true;
		try {
			const entity = await resolved.ops.get(resolved.ep);
			if (token !== openToken) return;
			if (entity) request = { ...req, uuid: entity.uuid, movedFrom: entity.moved_from };
		} catch {
			// Identity unknown — the modal falls back to offering a plain delete.
		} finally {
			if (token === openToken) resolving = false;
		}
	}

	function close() {
		if (busy) return;
		openToken++;
		request = null;
		resolving = false;
		error = null;
	}

	async function confirm(target: RedirectTarget | null) {
		const req = request;
		if (!req) return;

		busy = true;
		error = null;
		messageHandler.clear();
		try {
			const result = await redirectAndDelete(req, target);
			if (!result.success) {
				// Keep the modal open and report inside it — a page banner would sit
				// behind the backdrop.
				error = result.message;
				return;
			}

			request = null;
			req.onSuccess?.();

			messageHandler.showSuccess(
				target ? `Redirected "${req.name}" → "${target.name}". ${result.message}` : result.message
			);

			// Child cards (navigateOnDelete: null) stay put for both outcomes. Detail
			// pages go to the replacement on a redirect, to their parent otherwise.
			const destination =
				req.navigateOnDelete == null ? null : target ? target.href : req.navigateOnDelete;
			if (destination) setTimeout(() => goto(destination), navigateDelay);
		} catch (e) {
			error = e instanceof Error ? e.message : `Failed to delete ${req.label.toLowerCase()}`;
		} finally {
			busy = false;
		}
	}

	return {
		get show() {
			return request !== null;
		},
		get source(): RedirectSource | null {
			return request;
		},
		get isLocalCreate() {
			return isLocalCreate;
		},
		get busy() {
			return busy;
		},
		/** True while the source's canonical UUID is being looked up. */
		get resolving() {
			return resolving;
		},
		get error() {
			return error;
		},
		get cascadeWarning(): string | undefined {
			if (!request) return undefined;
			return request.cascadeWarning ?? entityOps[request.type].cascadeWarning;
		},
		open,
		close,
		confirm
	};
}
