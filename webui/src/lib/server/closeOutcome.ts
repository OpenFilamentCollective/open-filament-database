/**
 * What closing a web-editor PR means, and telling the contributor.
 *
 * A maintainer closing a PR (without merging) either rejects it or hands it back:
 * - **rejected**: they wrote a comment starting with "Reject" (any case), e.g. "Rejected:
 *   duplicate of #800". The rest of that comment is the reason.
 * - **returned**: no such comment, and there is feedback (feedback.ts). The contributor is
 *   sent the feedback and a link to fix it in the editor and resubmit.
 * - **closed**: anything else, e.g. the author or a bot closed it, or there was nothing to fix.
 */
import { env as privateEnv } from '$env/dynamic/private';
import {
	getPrFeedback,
	invalidateFeedback,
	feedbackToText,
	isWebEditorPr,
	prKind,
	type PrFeedback
} from '$lib/server/feedback';
import { setOutcome, type PrOutcome, type PrOutcomeKind } from '$lib/server/prOutcomes';
import { getEmailByUuidFromDb, updateStatus } from '$lib/server/submissionStore';
import { sendClosedEmail, sendRejectedEmail, sendReturnedEmail } from '$lib/server/email';
import { sendWebhook } from '$lib/server/webhooks';
import { upsertMarkedComment } from '$lib/server/github';
import { getReadToken, submissionUrl, webuiUrl } from '$lib/server/readToken';

export const FEEDBACK_MARKER = '<!-- ofd-feedback -->';

export interface CloseClassification {
	outcome: Exclude<PrOutcomeKind, 'open'>;
	reason?: string;
}

/** Pure: how a close should be read. */
export function classifyClose(opts: {
	prAuthor: string;
	prAuthorIsBot: boolean;
	closedBy: string;
	closedByIsBot: boolean;
	feedback: Pick<PrFeedback, 'items' | 'rejectComment'>;
}): CloseClassification {
	// Bots close PRs as housekeeping (superseded, auto-merge tidy-up), never as review.
	if (opts.closedByIsBot) return { outcome: 'closed' };
	// The contributor withdrew it.
	if (!opts.prAuthorIsBot && opts.closedBy.toLowerCase() === opts.prAuthor.toLowerCase()) {
		return { outcome: 'closed' };
	}
	if (opts.feedback.rejectComment)
		return { outcome: 'rejected', reason: opts.feedback.rejectComment.reason || undefined };
	if (opts.feedback.items.length > 0) return { outcome: 'returned' };
	return { outcome: 'closed' };
}

/** The sticky PR comment for a returned PR. */
export function returnedComment(opts: {
	kind: 'bot' | 'fork';
	author: string;
	itemCount: number;
	prNumber: number;
	emailed: boolean;
}): string {
	const items = `${opts.itemCount} item${opts.itemCount === 1 ? '' : 's'} of feedback`;
	const link = webuiUrl()
		? `[Fix it in the web editor](${submissionUrl(opts.prNumber)})`
		: 'Fix it in the web editor';
	const lines = [FEEDBACK_MARKER, '### Returned for changes', ''];
	if (opts.kind === 'fork') {
		lines.push(
			`@${opts.author}, this pull request was closed so you can rework it. There ${opts.itemCount === 1 ? 'is' : 'are'} ${items} above.`,
			'',
			`${link}: your changes load back into the editor with the feedback next to them, and submitting opens a new pull request linked to this one.`
		);
	} else {
		lines.push(
			`This submission was returned to its contributor with ${items}.`,
			opts.emailed
				? 'They were notified by email.'
				: 'No email is on file for it, so the contributor could not be notified. They will see it if they open the editor again.',
			'',
			`${link}: resubmitting opens a new pull request linked to this one.`
		);
	}
	lines.push(
		'',
		'<sub>Comments starting with "Note" and resolved threads are not sent to the contributor. To reject a pull request outright, close it with a comment starting with "Reject".</sub>'
	);
	return lines.join('\n');
}

interface ClosedPr {
	number: number;
	html_url: string;
	head_ref: string;
	author: string;
	authorIsBot: boolean;
}

/**
 * Classify a close, record it and notify. Called by the GitHub webhook a few seconds after
 * the close event, so a "Close with comment" comment is visible to the API. Never throws.
 */
export async function handleWebEditorClose(
	pr: ClosedPr,
	closedBy: { login: string; isBot: boolean },
	uuid: string | null
): Promise<PrOutcome | null> {
	const kind = prKind(pr.head_ref);
	if (!isWebEditorPr(kind)) return null;

	try {
		const token = await getReadToken();
		let feedback: PrFeedback | null = null;
		if (token) {
			invalidateFeedback(pr.number);
			feedback = await getPrFeedback(pr.number, token);
		} else {
			console.warn(
				`[Close] No GitHub token to read feedback on #${pr.number}; treating it as a plain close`
			);
		}

		const { outcome, reason } = classifyClose({
			prAuthor: pr.author,
			prAuthorIsBot: pr.authorIsBot,
			closedBy: closedBy.login,
			closedByIsBot: closedBy.isBot,
			feedback: feedback ?? { items: [], rejectComment: null }
		});
		const items = feedback?.items ?? [];
		const email = uuid ? await getEmailByUuidFromDb(uuid).catch(() => undefined) : undefined;
		const fixUrl = webuiUrl() ? submissionUrl(pr.number) : undefined;

		let notified: PrOutcome['notified'] = 'none';
		if (kind === 'bot' && email) notified = 'email';
		else if (kind === 'fork' && outcome === 'returned') notified = 'mention';

		const record = await setOutcome({
			prNumber: pr.number,
			outcome,
			reason,
			closedBy: closedBy.login,
			feedbackCount: outcome === 'returned' ? items.length : 0,
			notified
		});
		if (uuid) updateStatus(uuid, outcome);

		// Outgoing webhook: "returned" travels as the existing changes_requested event, so
		// integrations that already handle it (SimplyPrint) need no change.
		const timestamp = new Date().toISOString();
		if (uuid) {
			if (outcome === 'returned') {
				sendWebhook({
					event: 'changes_requested',
					uuid,
					prNumber: pr.number,
					timestamp,
					reviewComments: feedbackToText(items)
				});
			} else {
				sendWebhook({ event: 'closed', uuid, prNumber: pr.number, timestamp, reason });
			}
		}

		if (email) {
			const send =
				outcome === 'returned'
					? sendReturnedEmail(email, pr.number, pr.html_url, items, fixUrl)
					: outcome === 'rejected'
						? sendRejectedEmail(email, pr.number, pr.html_url, reason, fixUrl)
						: sendClosedEmail(email, pr.number, pr.html_url, fixUrl);
			await send.catch((err: any) =>
				console.error(`[Close] Email for #${pr.number} failed:`, err?.message ?? err)
			);
		}

		if (outcome === 'returned' && token && privateEnv.GITHUB_APP_ID) {
			await upsertMarkedComment(
				token,
				privateEnv.GITHUB_UPSTREAM_OWNER!,
				privateEnv.GITHUB_UPSTREAM_REPO!,
				pr.number,
				FEEDBACK_MARKER,
				returnedComment({
					kind: kind as 'bot' | 'fork',
					author: pr.author,
					itemCount: items.length,
					prNumber: pr.number,
					emailed: notified === 'email'
				})
			).catch((err) => console.warn(`[Close] Could not comment on #${pr.number}:`, err.message));
		}

		console.log(
			`[Close] #${pr.number} closed by ${closedBy.login}: ${outcome}${reason ? ` (${reason})` : ''}, ${items.length} feedback item(s), notified: ${notified}`
		);
		return record;
	} catch (err) {
		console.error(`[Close] Handling the close of #${pr.number} failed:`, err);
		return null;
	}
}
