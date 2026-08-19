/**
 * SimplyPrint-authenticated submission endpoint.
 * Creates a PR via the bot account, attributed to the SimplyPrint user.
 * Requires SimplyPrint OAuth authentication.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isAnonBotEnabled, createAnonPR, amendAnonPR } from '$lib/server/anonBot';
import { runCloudValidation } from '$lib/server/cloudValidator';
import { sendWebhook } from '$lib/server/webhooks';
import { trackSubmission, getSubmission } from '$lib/server/submissionStore';
import { getSimplyPrintToken, getSimplyPrintUser } from '$lib/server/auth';
import { checkRateLimit } from '$lib/server/rateLimit';
import type { Job } from '$lib/server/jobManager';
import crypto from 'crypto';

export const POST: RequestHandler = async ({ request, cookies, getClientAddress }) => {
	// 1. Check feature flag
	if (!isAnonBotEnabled()) {
		return json({ error: 'Bot submissions are not enabled' }, { status: 404 });
	}

	// 2. Require SimplyPrint authentication
	const spToken = getSimplyPrintToken(cookies);
	if (!spToken) {
		return json({ error: 'SimplyPrint authentication required' }, { status: 401 });
	}

	let spUser;
	try {
		spUser = await getSimplyPrintUser(spToken);
	} catch {
		return json({ error: 'SimplyPrint session expired. Please log in again.' }, { status: 401 });
	}

	// 3. Rate limiting
	const ip = getClientAddress();
	const rateCheck = checkRateLimit(ip);
	if (!rateCheck.allowed) {
		return json(
			{ error: 'Rate limit exceeded. Please try again later.' },
			{
				status: 429,
				headers: {
					'Retry-After': String(Math.ceil((rateCheck.retryAfterMs || 3600000) / 1000))
				}
			}
		);
	}

	// 4. Parse and validate input
	let body: any;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON' }, { status: 400 });
	}

	const { changes, images, title, description, amendUuid } = body;

	if (!changes || !Array.isArray(changes) || changes.length === 0) {
		return json({ error: 'No changes to submit' }, { status: 400 });
	}

	// 5. Resolve an amend target, if the client asked to add to an open submission.
	//
	//    Contributors regularly submit, keep editing, and submit again minutes later; without
	//    this they get competing PRs on the same paths (#459/#460/#461 merged out of order and
	//    left an orphan filament in `main`). Adding to the open PR keeps it one review.
	//
	//    A submission UUID is not a secret — it is printed in the PR body — so amending is
	//    gated on the submission having been made by *this* SimplyPrint account.
	let amendTarget: { uuid: string; prNumber: number; previousChanges: any[] } | null = null;
	//    Set when an amend was asked for but the PR turned out to be unamendable, so the
	//    response can explain why a new PR number came back. The same fallback is applied
	//    whether the closed PR is noticed here or by `amendAnonPR` a few steps down.
	let amendUuidRetired: string | undefined;
	if (typeof amendUuid === 'string' && amendUuid.length > 0) {
		const existing = getSubmission(amendUuid);
		if (!existing) {
			return json({ error: 'Unknown submission to add to.' }, { status: 404 });
		}
		if (!spUser.email || existing.email !== spUser.email) {
			return json({ error: 'That submission belongs to someone else.' }, { status: 403 });
		}
		if (existing.status !== 'open' && existing.status !== 'changes_requested') {
			// Already merged or closed. Fall through to a fresh PR rather than erroring out —
			// the contributor's work is the same either way, and the alternative is a dead end.
			amendUuidRetired = amendUuid;
		} else {
			// The previous batches, so the rewritten PR body describes the whole submission.
			let previousChanges: any[] = [];
			try {
				previousChanges = JSON.parse(existing.changeData || '{}').changes ?? [];
			} catch {
				// A malformed cached payload only costs us the earlier bullets in the PR body.
			}
			amendTarget = { uuid: amendUuid, prNumber: existing.prNumber, previousChanges };
		}
	}

	// 6. Generate UUID (an amend reuses the submission's existing one)
	const uuid = amendTarget?.uuid ?? crypto.randomUUID();

	// 7. Run validation synchronously
	const validationJob: Job = {
		id: `sp-validation-${uuid}`,
		type: 'validation',
		startTime: Date.now(),
		status: 'running',
		events: []
	};

	await runCloudValidation(validationJob, changes, images || {});

	if (validationJob.status === 'error') {
		const errorMsg =
			validationJob.events.find((e: any) => e.type === 'error')?.message ||
			'Validation failed';
		return json({ error: errorMsg }, { status: 400 });
	}

	if (validationJob.result && !validationJob.result.is_valid) {
		return json(
			{
				error: 'Validation errors found',
				validation: validationJob.result
			},
			{ status: 422 }
		);
	}

	// 8. Create or amend the PR via the bot, attributed to the SimplyPrint user
	try {
		let result = amendTarget
			? await amendAnonPR({
					uuid,
					prNumber: amendTarget.prNumber,
					changes,
					allChanges: [...amendTarget.previousChanges, ...changes],
					images: images || {},
					title,
					description
				})
			: await createAnonPR({ uuid, changes, images: images || {}, title, description });

		// The PR may have merged or had its branch deleted between the client's last status
		// poll and now. Falling back to a new PR is better than losing the contributor's work.
		let submissionUuid = uuid;
		if (!result.success && 'retryAsNew' in result && result.retryAsNew) {
			amendUuidRetired = amendTarget!.uuid;
			amendTarget = null;
			submissionUuid = crypto.randomUUID();
			result = await createAnonPR({
				uuid: submissionUuid,
				changes,
				images: images || {},
				title,
				description
			});
		}

		if (!result.success) {
			return json({ error: result.error || 'Failed to create PR' }, { status: 500 });
		}

		// 9. Track submission (store email for lifecycle notifications). An amend re-records
		//    the submission under the same UUID with the combined change set, so a later amend
		//    can still describe every batch.
		const trackedChanges = amendTarget
			? [...amendTarget.previousChanges, ...changes]
			: changes;
		const changeData = JSON.stringify({ changes: trackedChanges, images: images || {} });
		trackSubmission(
			submissionUuid,
			result.prNumber!,
			result.prUrl!,
			changeData,
			spUser.email || undefined
		);

		// 10. Fire "submitted" webhook (fire-and-forget)
		sendWebhook({
			event: 'submitted',
			uuid: submissionUuid,
			prNumber: result.prNumber!,
			prUrl: result.prUrl!,
			timestamp: new Date().toISOString()
		});

		// 11. Return result
		return json({
			success: true,
			uuid: submissionUuid,
			prUrl: result.prUrl,
			prNumber: result.prNumber,
			amended: result.amended === true,
			// Set when the client asked to amend but the PR had already closed, so the UI can
			// explain why it got a new PR number back.
			amendFellBackFrom: amendUuidRetired
		});
	} catch (error: any) {
		console.error('Bot PR creation error:', error);
		return json({ error: error.message || 'Failed to create PR' }, { status: 500 });
	}
};
