/**
 * Everything the `/api/submissions/[pr]/*` endpoints and the `/submissions/[pr]` page need
 * to know about a PR and the visitor: the PR, its submission record, how it was closed,
 * and whether the visitor may revise it.
 */
import type { Cookies } from '@sveltejs/kit';
import { env as privateEnv } from '$env/dynamic/private';
import { getPullRequestDetails, type PullRequestDetails } from '$lib/server/github';
import { extractUuidFromBody } from '$lib/server/anonBot';
import {
	getSubmission,
	getUuidByPrNumber,
	type SubmissionRecord
} from '$lib/server/submissionStore';
import { getOutcome, type PrOutcome } from '$lib/server/prOutcomes';
import { checkReviseAccess, type ReviseAccess } from '$lib/server/revision';
import { getReadToken } from '$lib/server/readToken';
import type { SubmissionStatus } from '$lib/types/feedback';

export interface SubmissionContext {
	token: string;
	pr: PullRequestDetails;
	uuid: string | null;
	record: SubmissionRecord | undefined;
	outcome: PrOutcome | undefined;
	access: ReviseAccess;
}

export class ContextError extends Error {
	constructor(
		public status: number,
		message: string
	) {
		super(message);
	}
}

export function parsePrNumber(param: string | undefined): number {
	const n = Number(param);
	if (!Number.isInteger(n) || n <= 0) throw new ContextError(404, 'Not a pull request number');
	return n;
}

export async function loadSubmissionContext(
	prNumber: number,
	cookies: Cookies
): Promise<SubmissionContext> {
	const owner = privateEnv.GITHUB_UPSTREAM_OWNER;
	const repo = privateEnv.GITHUB_UPSTREAM_REPO;
	if (!owner || !repo) throw new ContextError(500, 'Upstream repository not configured');

	const token = await getReadToken(cookies);
	if (!token) {
		throw new ContextError(
			503,
			'GitHub access is not configured on this server. Sign in with GitHub to continue.'
		);
	}

	const pr = await getPullRequestDetails(token, owner, repo, prNumber);
	if (!pr) throw new ContextError(404, `Pull request #${prNumber} not found`);

	const uuid = extractUuidFromBody(pr.body) ?? getUuidByPrNumber(prNumber) ?? null;
	const record = uuid ? getSubmission(uuid) : undefined;
	const outcome = await getOutcome(prNumber).catch(() => undefined);
	const access = await checkReviseAccess(cookies, pr, record, outcome);
	return { token, pr, uuid, record, outcome, access };
}

export function submissionStatus(
	pr: PullRequestDetails,
	outcome: PrOutcome | undefined,
	feedbackCount: number
): SubmissionStatus {
	if (pr.merged) return 'merged';
	if (pr.state === 'open') return feedbackCount > 0 ? 'feedback' : 'open';
	if (outcome?.outcome === 'returned' || outcome?.outcome === 'rejected') return outcome.outcome;
	return 'closed';
}

/** The parts of `ReviseAccess` that are safe to send to the browser. */
export function publicAccess(access: ReviseAccess) {
	return {
		allowed: access.allowed,
		as: access.as,
		via: access.via,
		mode: access.mode,
		reason: access.reason,
		signIn: access.signIn,
		kind: access.kind,
		login: access.login,
		isMaintainer: access.isMaintainer
	};
}
