/**
 * Reconciles the merge state of client-tracked PRs against GitHub.
 *
 * The webhook (/api/webhooks/github) is the primary way submissions get marked
 * merged/closed, but if the server was down when the PR merged the webhook is
 * missed and the DB stays 'open' forever. This endpoint lets the client send the
 * PR numbers it still considers "awaiting merge"; for any that aren't already
 * terminal in our store we ask GitHub for the real state, update the DB, and
 * return the truth so the client can drop merged/closed entries.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env as privateEnv } from '$env/dynamic/private';
import { getPullRequest } from '$lib/server/github';
import { getInstallationToken } from '$lib/server/githubApp';
import { getUuidByPrNumber, getSubmission, updateStatus } from '$lib/server/submissionStore';

type Status = 'open' | 'merged' | 'closed' | 'changes_requested' | 'unknown';

const MAX_PRS = 50;

export const POST: RequestHandler = async ({ request }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON' }, { status: 400 });
	}

	const raw = (body as { prNumbers?: unknown })?.prNumbers;
	if (!Array.isArray(raw)) {
		return json({ error: 'prNumbers must be an array' }, { status: 400 });
	}

	// Sanitize: positive integers, unique, capped.
	const prNumbers = [...new Set(raw.filter((n): n is number => Number.isInteger(n) && n > 0))].slice(
		0,
		MAX_PRS
	);

	const owner = privateEnv.GITHUB_UPSTREAM_OWNER;
	const repo = privateEnv.GITHUB_UPSTREAM_REPO;
	if (!owner || !repo) {
		return json({ error: 'Upstream repo not configured' }, { status: 500 });
	}

	// Use the GitHub App installation token if available to raise the rate limit;
	// fall back to unauthenticated requests (the repo is public).
	let token: string | null = null;
	try {
		token = await getInstallationToken();
	} catch {
		token = null;
	}

	const statuses: Record<number, Status> = {};
	// GitHub's merge timestamps, so the client can tell when the nightly dataset rebuild will
	// have published a merged submission (see $lib/config/datasetSchedule.ts). The client falls
	// back to "now" when a timestamp is missing, which over-extends the overlay, so a merged PR
	// is always asked about upstream even when we already know it merged.
	const mergedAt: Record<number, string | null> = {};

	await Promise.all(
		prNumbers.map(async (prNumber) => {
			const uuid = getUuidByPrNumber(prNumber);
			const cached = uuid ? getSubmission(uuid) : undefined;
			// A locally-recorded 'closed' is the whole answer — nothing else to learn from GitHub.
			// 'merged' still needs the upstream call for `merged_at`; the store has no such column.
			if (cached?.status === 'closed') {
				statuses[prNumber] = 'closed';
				return;
			}

			try {
				const pr = await getPullRequest(token, owner, repo, prNumber);
				if (!pr) {
					statuses[prNumber] = cached?.status === 'merged' ? 'merged' : 'unknown';
					return;
				}
				if (pr.merged_at) mergedAt[prNumber] = pr.merged_at;

				let status: Status;
				if (pr.merged) status = 'merged';
				else if (pr.state === 'closed') status = 'closed';
				else status = cached?.status === 'changes_requested' ? 'changes_requested' : 'open';

				// Persist newly-discovered terminal states the webhook may have missed.
				if (uuid && (status === 'merged' || status === 'closed') && cached?.status !== status) {
					updateStatus(uuid, status);
				}

				statuses[prNumber] = status;
			} catch (err) {
				console.warn(`[Submissions] Failed to check PR #${prNumber}:`, (err as Error).message);
				// Don't downgrade a merge we already know about just because GitHub was unreachable.
				statuses[prNumber] = cached?.status === 'merged' ? 'merged' : 'unknown';
			}
		})
	);

	return json({ statuses, mergedAt });
};
