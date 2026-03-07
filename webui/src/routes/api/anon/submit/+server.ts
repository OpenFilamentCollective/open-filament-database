/**
 * Anonymous submission endpoint.
 * Creates a PR via the bot account on behalf of an anonymous user.
 * Validation runs synchronously (blocks until complete).
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isAnonBotEnabled, createAnonPR } from '$lib/server/anonBot';
import { runCloudValidation } from '$lib/server/cloudValidator';
import { sendWebhook } from '$lib/server/webhooks';
import { trackSubmission } from '$lib/server/submissionStore';
import { storeEmail } from '$lib/server/emailStore';
import { checkRateLimit } from '$lib/server/rateLimit';
import type { Job } from '$lib/server/jobManager';
import crypto from 'crypto';

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	// 1. Check feature flag
	if (!isAnonBotEnabled()) {
		return json({ error: 'Anonymous submissions are not enabled' }, { status: 404 });
	}

	// 2. Rate limiting
	const ip = getClientAddress();
	const rateCheck = checkRateLimit(ip);
	if (!rateCheck.allowed) {
		return json(
			{ error: 'Rate limit exceeded. Please try again later.' },
			{
				status: 429,
				headers: { 'Retry-After': String(Math.ceil((rateCheck.retryAfterMs || 3600000) / 1000)) }
			}
		);
	}

	// 3. Parse and validate input
	let body: any;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON' }, { status: 400 });
	}

	const { changes, images, title, description, email } = body;

	if (!changes || !Array.isArray(changes) || changes.length === 0) {
		return json({ error: 'No changes to submit' }, { status: 400 });
	}

	// 4. Generate UUID
	const uuid = crypto.randomUUID();

	// 5. Run validation synchronously (blocks until complete)
	const validationJob: Job = {
		id: `anon-validation-${uuid}`,
		type: 'validation',
		startTime: Date.now(),
		status: 'running',
		events: []
	};

	await runCloudValidation(validationJob, changes, images || {});

	if (validationJob.status === 'error') {
		const errorMsg = validationJob.events.find((e: any) => e.type === 'error')?.message || 'Validation failed';
		return json({ error: errorMsg }, { status: 400 });
	}

	if (validationJob.result && !validationJob.result.is_valid) {
		return json({
			error: 'Validation errors found',
			validation: validationJob.result
		}, { status: 422 });
	}

	// 6. Create PR via bot
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

		// 7. Track submission (UUID + PR number + change data for deflation)
		const changeData = JSON.stringify({ changes, images: images || {} });
		trackSubmission(uuid, result.prNumber!, result.prUrl!, changeData);

		// 8. Store email separately if provided (never in submission store or response)
		if (email && typeof email === 'string' && email.includes('@')) {
			storeEmail(uuid, email.trim());
		}

		// 9. Fire "submitted" webhook (fire-and-forget)
		sendWebhook({
			event: 'submitted',
			uuid,
			prNumber: result.prNumber!,
			prUrl: result.prUrl!,
			timestamp: new Date().toISOString()
		});

		// 10. Return UUID to caller (no email in response)
		return json({
			success: true,
			uuid,
			prUrl: result.prUrl,
			prNumber: result.prNumber
		});
	} catch (error: any) {
		console.error('Anonymous PR creation error:', error);
		return json({ error: error.message || 'Failed to create PR' }, { status: 500 });
	}
};
