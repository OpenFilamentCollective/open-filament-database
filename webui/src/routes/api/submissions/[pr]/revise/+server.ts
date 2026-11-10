/**
 * Submit a revision of a PR from the editor (see revision.ts).
 *
 * Body: `{ changes, images, expectedHeadSha, title?, description? }`, where `changes` is
 * the editor's whole change set for this PR, not just the latest edits.
 *
 * - Open PR: the change set is pushed onto the PR's branch. 409 if the branch moved since
 *   the editor loaded it.
 * - Returned PR: a new PR is opened ("Resubmission of #N") and the old one points to it.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env as privateEnv } from '$env/dynamic/private';
import { runCloudValidation } from '$lib/server/cloudValidator';
import type { Job } from '$lib/server/jobManager';
import { checkRateLimit } from '$lib/server/rateLimit';
import { trackSubmission } from '$lib/server/submissionStore';
import { setSupersededBy } from '$lib/server/prOutcomes';
import { invalidateFeedback } from '$lib/server/feedback';
import { sendWebhook } from '$lib/server/webhooks';
import { createIssueComment, getPullRequestDetails } from '$lib/server/github';
import { getReadToken } from '$lib/server/readToken';
import { previewFor } from '$lib/server/devFixtures';
import {
	RevisionConflictError,
	announceRevision,
	pushRevision,
	pushToken,
	resubmitReturned,
	postFieldNotes,
	sanitizeNotes
} from '$lib/server/revision';
import {
	ContextError,
	loadSubmissionContext,
	parsePrNumber,
	publicAccess
} from '$lib/server/submissionContext';

export const POST: RequestHandler = async ({ params, cookies, request, getClientAddress }) => {
	let prNumber: number;
	try {
		prNumber = parsePrNumber(params.pr);
	} catch (err) {
		return json({ error: (err as Error).message }, { status: 404 });
	}

	// A development preview (/api/dev/preview/<pr>) is a snapshot of someone else's PR: never submit it.
	if (previewFor(cookies, prNumber)) {
		return json(
			{ error: 'This is development preview data, so nothing was submitted.' },
			{ status: 409 }
		);
	}

	const rate = checkRateLimit(`revise:${getClientAddress()}`);
	if (!rate.allowed) {
		return json(
			{ error: 'Rate limit exceeded. Please try again later.' },
			{
				status: 429,
				headers: { 'Retry-After': String(Math.ceil((rate.retryAfterMs || 3_600_000) / 1000)) }
			}
		);
	}

	let body: any;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON' }, { status: 400 });
	}
	const { changes, images, expectedHeadSha, title, description } = body ?? {};
	// The contributor's comments on fields, posted on those lines once the change is pushed.
	const notes = sanitizeNotes(body?.notes);
	if (!Array.isArray(changes) || changes.length === 0) {
		return json({ error: 'No changes to submit' }, { status: 400 });
	}

	try {
		const ctx = await loadSubmissionContext(prNumber, cookies);
		const { access, pr } = ctx;
		if (!access.allowed) {
			return json(
				{ error: access.reason, access: publicAccess(access) },
				{ status: access.signIn ? 401 : 403 }
			);
		}
		if (access.mode === 'amend' && typeof expectedHeadSha !== 'string') {
			return json({ error: 'expectedHeadSha is required' }, { status: 400 });
		}

		// Same validation as a first submission.
		const job: Job = {
			id: `revise-validation-${prNumber}-${Date.now()}`,
			type: 'validation',
			startTime: Date.now(),
			status: 'running',
			events: []
		};
		await runCloudValidation(job, changes, images || {});
		if (job.status === 'error') {
			const message =
				job.events.find((e: any) => e.type === 'error')?.message || 'Validation failed';
			return json({ error: message }, { status: 400 });
		}
		if (job.result && !job.result.is_valid) {
			return json({ error: 'Validation errors found', validation: job.result }, { status: 422 });
		}

		const changeData = JSON.stringify({ changes, images: images || {} });

		if (access.mode === 'amend') {
			const token = await pushToken(access, cookies);
			let pushed;
			try {
				pushed = await pushRevision({
					token,
					pr,
					expectedHeadSha,
					changes,
					images,
					message: title || `Revise #${prNumber} via the web editor`
				});
			} catch (err) {
				if (err instanceof RevisionConflictError)
					return json({ error: err.message }, { status: 409 });
				throw err;
			}
			invalidateFeedback(prNumber);
			const notesPosted = await postFieldNotes({
				token,
				prNumber,
				commitSha: pushed.commitSha ?? expectedHeadSha,
				notes
			});
			if (pushed.unchanged) {
				return json({
					success: true,
					mode: 'amend',
					unchanged: true,
					notesPosted,
					prNumber,
					prUrl: pr.html_url,
					uuid: ctx.uuid
				});
			}

			try {
				await announceRevision({ token, pr, access, changes, commitSha: pushed.commitSha! });
			} catch (err) {
				console.warn(
					`[Revise] Pushed #${prNumber} but could not update its body/comment:`,
					(err as Error).message
				);
			}
			// The record now describes the whole revised submission, replacing earlier batches.
			if (ctx.uuid) trackSubmission(ctx.uuid, prNumber, pr.html_url, changeData, ctx.record?.email);

			return json({
				success: true,
				mode: 'amend',
				prNumber,
				prUrl: pr.html_url,
				commitSha: pushed.commitSha,
				notesPosted,
				uuid: ctx.uuid,
				skippedPaths: pushed.skippedPaths.length ? pushed.skippedPaths : undefined,
				noopDeletes: pushed.noopDeletes.length ? pushed.noopDeletes : undefined
			});
		}

		// Resubmission of a returned PR.
		const result = await resubmitReturned({
			cookies,
			access,
			pr,
			changes,
			images,
			title,
			description
		});
		trackSubmission(
			result.uuid,
			result.prNumber,
			result.prUrl,
			changeData,
			access.via === 'bot' ? ctx.record?.email : undefined
		);
		await setSupersededBy(prNumber, result.prNumber).catch((err) =>
			console.warn('[Revise] Failed to record supersededBy:', err.message)
		);

		// Point the old PR at the new one. The App posts it when it can, so a contributor
		// without GitHub notifications on still leaves a trail; otherwise the user does.
		const owner = privateEnv.GITHUB_UPSTREAM_OWNER!;
		const repo = privateEnv.GITHUB_UPSTREAM_REPO!;
		const commentToken =
			(access.via === 'bot' ? await getReadToken() : null) ??
			(await pushToken({ ...access, via: 'user-token' }, cookies).catch(() => null));
		if (commentToken) {
			await createIssueComment(
				commentToken,
				owner,
				repo,
				prNumber,
				`Resubmitted as #${result.prNumber}.`
			).catch((err) => console.warn(`[Revise] Could not comment on #${prNumber}:`, err.message));
		}
		// The comments go on the new PR's lines.
		let notesPosted: Awaited<ReturnType<typeof postFieldNotes>> = 'none';
		if (notes.length > 0) {
			const noteToken = await pushToken(access, cookies).catch(() => null);
			const created = noteToken
				? await getPullRequestDetails(noteToken, owner, repo, result.prNumber).catch(() => null)
				: null;
			if (noteToken && created) {
				notesPosted = await postFieldNotes({
					token: noteToken,
					prNumber: result.prNumber,
					commitSha: created.head_sha,
					notes
				});
			}
		}
		if (access.via === 'bot') {
			sendWebhook({
				event: 'submitted',
				uuid: result.uuid,
				prNumber: result.prNumber,
				prUrl: result.prUrl,
				timestamp: new Date().toISOString()
			});
		}
		invalidateFeedback(prNumber);

		return json({
			success: true,
			mode: 'resubmit',
			replaces: prNumber,
			notesPosted,
			prNumber: result.prNumber,
			prUrl: result.prUrl,
			uuid: result.uuid,
			skippedPaths: result.skippedPaths,
			noopDeletes: result.noopDeletes
		});
	} catch (err) {
		if (err instanceof ContextError) return json({ error: err.message }, { status: err.status });
		console.error(`[Revise] #${prNumber} failed:`, err);
		return json(
			{ error: (err as Error).message || 'Failed to submit the revision' },
			{ status: 500 }
		);
	}
};
