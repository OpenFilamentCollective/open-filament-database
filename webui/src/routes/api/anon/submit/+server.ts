/**
 * SimplyPrint-authenticated submission endpoint.
 * Creates a PR via the bot account, attributed to the SimplyPrint user.
 * Requires SimplyPrint OAuth authentication.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isAnonBotEnabled, createAnonPR } from '$lib/server/anonBot';
import { runCloudValidation } from '$lib/server/cloudValidator';
import { sendWebhook } from '$lib/server/webhooks';
import { trackSubmission } from '$lib/server/submissionStore';
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

	const { changes, images, title, description } = body;

	if (!changes || !Array.isArray(changes) || changes.length === 0) {
		return json({ error: 'No changes to submit' }, { status: 400 });
	}

	// 5. Generate UUID
	const uuid = crypto.randomUUID();

	// 6. Run validation synchronously
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

	// 7. Create PR via bot with SimplyPrint user attribution
	try {
		const result = await createAnonPR({
			uuid,
			changes,
			images: images || {},
			title,
			description
		});

		if (!result.success) {
			return json({ error: result.error || 'Failed to create PR' }, { status: 500 });
		}

		// 8. Track submission (store email for lifecycle notifications)
		const changeData = JSON.stringify({ changes, images: images || {} });
		trackSubmission(uuid, result.prNumber!, result.prUrl!, changeData, spUser.email || undefined);

		// 9. Fire "submitted" webhook (fire-and-forget)
		sendWebhook({
			event: 'submitted',
			uuid,
			prNumber: result.prNumber!,
			prUrl: result.prUrl!,
			timestamp: new Date().toISOString()
		});

		// 10. Return result
		return json({
			success: true,
			uuid,
			prUrl: result.prUrl,
			prNumber: result.prNumber
		});
	} catch (error: any) {
		console.error('Bot PR creation error:', error);
		return json({ error: error.message || 'Failed to create PR' }, { status: 500 });
	}
};
