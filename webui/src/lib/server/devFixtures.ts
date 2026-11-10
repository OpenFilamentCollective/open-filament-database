/**
 * Development-only previews of the review-feedback flow, from snapshots of real PRs.
 *
 * Visiting `/api/dev/preview/<pr>` turns a preview on for *this browser* (a cookie) and adds
 * the PR to its submitted list. While it is on, the submission endpoints serve the snapshot
 * instead of asking GitHub, and present the PR as returned for changes with the visitor as
 * its submitter, so the contributor side can be seen without GitHub credentials, a database
 * or a real close. Submitting is refused.
 *
 * Never active in a production build: everything here checks `dev` first.
 */
import { dev } from '$app/environment';
import type { Cookies } from '@sveltejs/kit';
import type {
	FeedbackItem,
	PrChangesResponse,
	PrSummary,
	SubmissionFeedbackResponse
} from '$lib/types/feedback';
import type { PrChangeSet } from '$lib/server/prChanges';
import { cleanBody } from '$lib/server/feedback';
import pr827 from './devFixtures/pr827.json';

export const PREVIEW_COOKIE = 'ofd_dev_preview';

export interface PreviewSnapshot {
	capturedAt: string;
	pr: PrSummary;
	items: FeedbackItem[];
	changes: PrChangeSet;
}

/**
 * #827 (a SimplyPrint submission) as it stood when captured: the misspelled "Night Saphire",
 * the datasheet link, the AI's temperature/speed findings. Refresh it by re-running
 * `getPrFeedback` + `loadPrChanges` for the PR and saving the result here.
 */
const SNAPSHOTS: Record<number, PreviewSnapshot> = {
	827: pr827 as unknown as PreviewSnapshot
};

/** A snapshot by PR number, in development only. */
export function previewSnapshot(prNumber: number): PreviewSnapshot | null {
	return dev ? (SNAPSHOTS[prNumber] ?? null) : null;
}

/** PR numbers whose preview this browser turned on. */
export function enabledPreviews(cookies: Cookies | undefined): number[] {
	if (!dev || !cookies) return [];
	return (cookies.get(PREVIEW_COOKIE) ?? '')
		.split(',')
		.map(Number)
		.filter((n) => Number.isInteger(n) && n > 0 && n in SNAPSHOTS);
}

export function setPreview(cookies: Cookies, prNumber: number, enabled: boolean): number[] {
	if (!dev) return [];
	const current = new Set(enabledPreviews(cookies));
	if (enabled && prNumber in SNAPSHOTS) current.add(prNumber);
	else current.delete(prNumber);
	if (current.size === 0) cookies.delete(PREVIEW_COOKIE, { path: '/' });
	else
		cookies.set(PREVIEW_COOKIE, [...current].join(','), {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: false,
			maxAge: 60 * 60 * 24 * 7
		});
	return [...current];
}

/** The snapshot to serve for `prNumber`, when this browser has its preview on. */
export function previewFor(cookies: Cookies | undefined, prNumber: number): PreviewSnapshot | null {
	if (!enabledPreviews(cookies).includes(prNumber)) return null;
	return SNAPSHOTS[prNumber] ?? null;
}

/** A snapshot's items as feedback.ts shows them today (it may have been captured earlier). */
function items(snapshot: PreviewSnapshot): FeedbackItem[] {
	return snapshot.items.map((item) => ({
		...item,
		body: cleanBody(item.body),
		context: item.context && { ...item.context, excerpt: cleanBody(item.context.excerpt) }
	}));
}

/** The submitter's view of a returned submission. */
const SUBMITTER_ACCESS = {
	allowed: true,
	as: 'submitter',
	via: 'bot',
	mode: 'resubmit',
	kind: 'bot',
	isMaintainer: false
} as const;

export function previewFeedbackResponse(snapshot: PreviewSnapshot): SubmissionFeedbackResponse {
	return {
		pr: { ...snapshot.pr, state: 'closed', closedAt: snapshot.capturedAt },
		status: 'returned',
		outcome: { outcome: 'returned', closedAt: snapshot.capturedAt },
		items: items(snapshot),
		truncated: false,
		access: { ...SUBMITTER_ACCESS },
		preview: true
	};
}

export function previewChangesResponse(snapshot: PreviewSnapshot): PrChangesResponse {
	return {
		...snapshot.changes,
		title: snapshot.pr.title,
		url: snapshot.pr.url,
		uuid: null,
		feedback: items(snapshot),
		access: { ...SUBMITTER_ACCESS },
		preview: true
	};
}
