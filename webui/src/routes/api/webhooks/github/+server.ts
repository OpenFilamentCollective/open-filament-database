/**
 * GitHub webhook receiver for PR lifecycle events.
 * Looks up submission UUID from PR body, then fires external webhooks.
 *
 * Configure in GitHub repo settings:
 * - URL: https://your-domain.com/api/webhooks/github
 * - Content type: application/json
 * - Secret: (matches GITHUB_WEBHOOK_SECRET)
 * - Events: Pull requests, Pull request reviews
 *
 * Closing a web-editor PR without merging is classified by closeOutcome.ts as returned
 * (feedback goes back to the contributor), rejected or plainly closed.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { verifyGitHubSignature, sendWebhook } from '$lib/server/webhooks';
import { extractUuidFromBody } from '$lib/server/anonBot';
import { getUuidByPrNumber, getEmailByUuidFromDb, updateStatus } from '$lib/server/submissionStore';
import { sendMergedEmail, sendClosedEmail, sendChangesRequestedEmail } from '$lib/server/email';
import { getInstallationToken } from '$lib/server/githubApp';
import { deleteBranch } from '$lib/server/github';
import { getPrFeedback, invalidateFeedback, isWebEditorPr, prKind } from '$lib/server/feedback';
import type { FeedbackItem } from '$lib/types/feedback';
import { handleWebEditorClose } from '$lib/server/closeOutcome';
import { setOutcome } from '$lib/server/prOutcomes';
import { getReadToken, submissionUrl, webuiUrl } from '$lib/server/readToken';
import { env as privateEnv } from '$env/dynamic/private';

/**
 * How long to wait after a close before reading the PR's comments. GitHub's "Close with
 * comment" posts the comment first, but the API can lag the event by a moment.
 */
function closeSettleMs(): number {
	const configured = Number(privateEnv.OFD_CLOSE_SETTLE_MS);
	return Number.isFinite(configured) && configured >= 0 ? configured : 5_000;
}

function lookupUuid(pr: any): string | null {
	return extractUuidFromBody(pr.body || '') ?? getUuidByPrNumber(pr.number) ?? null;
}

export const POST: RequestHandler = async ({ request }) => {
	// 1. Read raw body for signature verification
	const rawBody = await request.text();

	// 2. Verify GitHub signature
	const signature = request.headers.get('x-hub-signature-256');
	if (!verifyGitHubSignature(rawBody, signature)) {
		return json({ error: 'Invalid signature' }, { status: 401 });
	}

	// 3. Parse event
	const event = request.headers.get('x-github-event');
	if (event !== 'pull_request' && event !== 'pull_request_review') {
		return json({ ok: true });
	}

	let payload: any;
	try {
		payload = JSON.parse(rawBody);
	} catch {
		return json({ error: 'Invalid JSON' }, { status: 400 });
	}

	// Handle pull_request_review events (changes requested)
	if (event === 'pull_request_review') {
		const review = payload.review;
		const pr = payload.pull_request;
		if (pr?.number) invalidateFeedback(pr.number);

		if (!review || !pr || review.state !== 'changes_requested') {
			return json({ ok: true });
		}

		const uuid = lookupUuid(pr);
		if (!uuid) {
			return json({ ok: true });
		}

		updateStatus(uuid, 'changes_requested');

		sendWebhook({
			event: 'changes_requested' as const,
			uuid,
			prNumber: pr.number,
			timestamp: new Date().toISOString(),
			reviewComments: review.body || undefined
		});

		// Send email notification, with every open feedback item and the fix link.
		void (async () => {
			const crEmail = await getEmailByUuidFromDb(uuid);
			if (!crEmail) {
				console.log(`[Webhook] No email stored for uuid ${uuid}, skipping notification`);
				return;
			}
			let items: FeedbackItem[] = [];
			try {
				const token = await getReadToken();
				items = (token ? (await getPrFeedback(pr.number, token))?.items : undefined) ?? [];
			} catch (err: any) {
				console.warn(`[Webhook] Could not collect feedback for #${pr.number}:`, err.message);
			}
			console.log(`[Webhook] Sending changes_requested email to ${crEmail} for PR #${pr.number}`);
			await sendChangesRequestedEmail(
				crEmail,
				pr.number,
				pr.html_url || pr._links?.html?.href || '',
				review.body || undefined,
				items,
				webuiUrl() ? submissionUrl(pr.number) : undefined
			);
		})().catch((err: any) => console.error('[Webhook] Failed to send changes_requested email:', err?.message ?? err));

		return json({ ok: true, uuid, event: 'changes_requested' });
	}

	// Handle pull_request events
	const action = payload.action;
	const pr = payload.pull_request;

	if (!pr) return json({ ok: true });
	const kind = prKind(pr.head?.ref ?? '');

	if (action === 'reopened') {
		if (!isWebEditorPr(kind)) return json({ ok: true });
		const uuid = lookupUuid(pr);
		if (uuid) updateStatus(uuid, 'open');
		await setOutcome({ prNumber: pr.number, outcome: 'open', feedbackCount: 0 }).catch((err) =>
			console.warn(`[Webhook] Could not record reopen of #${pr.number}:`, err.message)
		);
		return json({ ok: true, uuid, event: 'reopened' });
	}

	if (action !== 'closed') {
		return json({ ok: true });
	}

	// 4. Look up UUID
	const uuid = lookupUuid(pr);
	const isMerged = pr.merged === true;

	// 5. Clean up the bot's head branch (best-effort, fire-and-forget). The PR's commits stay
	//    reachable through `refs/pull/<n>/head`, which is what loading a returned PR reads.
	const headRef = pr.head?.ref;
	if (headRef?.startsWith('ofd-anon-')) {
		getInstallationToken()
			.then((token) =>
				deleteBranch(
					token,
					privateEnv.GITHUB_UPSTREAM_OWNER!,
					privateEnv.GITHUB_UPSTREAM_REPO!,
					headRef
				)
			)
			.catch((err: any) =>
				console.warn(`Branch cleanup failed for ${headRef}:`, err.message)
			);
	}

	// 6. A web-editor PR closed without merging: returned, rejected or closed. Decided once the
	//    closing comment is readable; the handler records it and notifies the contributor.
	if (!isMerged && isWebEditorPr(kind)) {
		const closedPr = {
			number: pr.number,
			html_url: pr.html_url || pr._links?.html?.href || '',
			head_ref: headRef ?? '',
			author: pr.user?.login ?? 'ghost',
			authorIsBot: pr.user?.type === 'Bot'
		};
		const closedBy = { login: payload.sender?.login ?? 'ghost', isBot: payload.sender?.type === 'Bot' };
		setTimeout(() => {
			void handleWebEditorClose(closedPr, closedBy, uuid);
		}, closeSettleMs());
		return json({ ok: true, uuid, event: 'closed', classifying: true });
	}

	if (!uuid) {
		return json({ ok: true });
	}

	// 7. Merged (or a legacy tracked PR closed): update status, notify.
	const webhookEvent = isMerged ? ('merged' as const) : ('closed' as const);
	updateStatus(uuid, isMerged ? 'merged' : 'closed');

	sendWebhook({
		event: webhookEvent,
		uuid,
		prNumber: pr.number,
		timestamp: new Date().toISOString()
	});

	getEmailByUuidFromDb(uuid).then((email) => {
		if (!email) {
			console.log(`[Webhook] No email stored for uuid ${uuid}, skipping notification`);
			return;
		}
		const prUrl = pr.html_url || pr._links?.html?.href || '';
		console.log(`[Webhook] Sending ${webhookEvent} email to ${email} for PR #${pr.number}`);
		const sendFn = isMerged ? sendMergedEmail : sendClosedEmail;
		sendFn(email, pr.number, prUrl, webuiUrl() ? submissionUrl(pr.number) : undefined)
			.catch((err: any) => console.error(`[Webhook] Failed to send ${webhookEvent} email:`, err));
	}).catch((err: any) => console.warn('Failed to look up email:', err.message));

	return json({ ok: true, uuid, event: webhookEvent });
};
