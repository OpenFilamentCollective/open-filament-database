/**
 * Development only: show a PR from its contributor's side (see devFixtures.ts).
 *
 * - `GET /api/dev/preview/827`: turn the preview on for this browser, add #827 to its
 *   submitted list (localStorage) as returned for changes, and go to /submissions/827.
 *   Everything after that is the normal code path.
 * - `GET /api/dev/preview/827?remove`: undo it, including a loaded revision of it.
 * - `GET /api/dev/preview/827?email=returned|changes_requested|rejected|merged|closed`:
 *   the email its contributor would get (`&format=text` for the text part).
 *
 * 404 outside development, and for PRs without a snapshot.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { previewFeedbackResponse, previewSnapshot, setPreview } from '$lib/server/devFixtures';
import {
	changesRequestedEmail,
	closedEmail,
	mergedEmail,
	rejectedEmail,
	returnedEmail,
	type EmailContent
} from '$lib/server/email';
import {
	STORAGE_KEY_ACTIVE_REVISION,
	STORAGE_KEY_CHANGES,
	STORAGE_KEY_SUBMITTED
} from '$lib/config/storageKeys';
import type { SubmittedEntry } from '$lib/types/changes';

const DAY_MS = 24 * 60 * 60 * 1000;

/** A tiny page that edits this origin's localStorage, then moves on. */
function storagePage(title: string, script: string): Response {
	const html = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body><script>${script}</script></body></html>`;
	return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

/** JSON that is safe inside a <script> element. */
function scriptJson(value: unknown): string {
	return JSON.stringify(value).replace(/</g, '\\u003c');
}

function emailFor(
	kind: string,
	prNumber: number,
	prUrl: string,
	page: string,
	items: any[]
): EmailContent | null {
	switch (kind) {
		case 'returned':
			return returnedEmail(prNumber, prUrl, items, page);
		case 'changes_requested':
			return changesRequestedEmail(
				prNumber,
				prUrl,
				'A few things to fix before this can go in.',
				items,
				page
			);
		case 'rejected':
			return rejectedEmail(prNumber, prUrl, 'Duplicate of an existing Insignia filament.', page);
		case 'merged':
			return mergedEmail(prNumber, prUrl, page);
		case 'closed':
			return closedEmail(prNumber, prUrl, page);
		default:
			return null;
	}
}

export const GET: RequestHandler = async ({ params, url, cookies }) => {
	const prNumber = Number(params.pr);
	const snapshot = Number.isInteger(prNumber) ? previewSnapshot(prNumber) : null;
	if (!snapshot) return json({ error: 'Not found' }, { status: 404 });

	const { pr, items } = previewFeedbackResponse(snapshot);
	const page = `${url.origin}/submissions/${prNumber}`;

	const kind = url.searchParams.get('email');
	if (kind) {
		const email = emailFor(kind, prNumber, pr.url, page, items);
		if (!email) return json({ error: `Unknown email "${kind}"` }, { status: 400 });
		if (url.searchParams.get('format') === 'text') {
			return new Response(`Subject: ${email.subject}\n\n${email.text}`, {
				headers: { 'Content-Type': 'text/plain; charset=utf-8' }
			});
		}
		return new Response(email.html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
	}

	const uuid = `dev-preview-${prNumber}`;

	if (url.searchParams.has('remove')) {
		setPreview(cookies, prNumber, false);
		return storagePage(
			`Preview of #${prNumber} removed`,
			`(() => {
	const buffer = JSON.parse(localStorage.getItem(${scriptJson(STORAGE_KEY_SUBMITTED)}) || 'null');
	if (buffer && buffer.entries) {
		delete buffer.entries[${scriptJson(uuid)}];
		localStorage.setItem(${scriptJson(STORAGE_KEY_SUBMITTED)}, JSON.stringify(buffer));
	}
	const revision = JSON.parse(localStorage.getItem(${scriptJson(STORAGE_KEY_ACTIVE_REVISION)}) || 'null');
	if (revision && revision.prNumber === ${prNumber}) {
		localStorage.removeItem(${scriptJson(STORAGE_KEY_ACTIVE_REVISION)});
		localStorage.removeItem(${scriptJson(STORAGE_KEY_CHANGES)});
	}
	location.replace('/');
})();`
		);
	}

	setPreview(cookies, prNumber, true);

	// What `submittedStore.archive` would have stored had this browser made the submission;
	// the status reconcile then reports it returned (the cookie above), like for its contributor.
	const now = Date.now();
	const changes = snapshot.changes.changes.map((c) => ({
		entity: c.entity,
		operation: c.operation,
		data: c.data,
		timestamp: now
	}));
	const entry = {
		uuid,
		prUrl: pr.url,
		prNumber,
		submittedAt: new Date(now).toISOString(),
		expiresAt: new Date(now + 30 * DAY_MS).toISOString(),
		changes,
		paths: changes.map((c) => c.entity.path),
		status: 'returned'
	} as SubmittedEntry;

	return storagePage(
		`Preview of #${prNumber}`,
		`(() => {
	const key = ${scriptJson(STORAGE_KEY_SUBMITTED)};
	let buffer = null;
	try { buffer = JSON.parse(localStorage.getItem(key)); } catch {}
	if (!buffer || buffer.version !== 1) buffer = { entries: {}, version: 1 };
	buffer.entries[${scriptJson(uuid)}] = ${scriptJson(entry)};
	localStorage.setItem(key, JSON.stringify(buffer));
	location.replace(${scriptJson(`/submissions/${prNumber}`)});
})();`
	);
};
