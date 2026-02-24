/**
 * GitHub webhook receiver for PR lifecycle events.
 * Looks up submission UUID from PR body, then fires external webhooks.
 *
 * Configure in GitHub repo settings:
 * - URL: https://your-domain.com/api/webhooks/github
 * - Content type: application/json
 * - Secret: (matches GITHUB_WEBHOOK_SECRET)
 * - Events: Pull requests
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { verifyGitHubSignature, sendWebhook } from '$lib/server/webhooks';
import { extractUuidFromBody } from '$lib/server/anonBot';
import { getUuidByPrNumber, updateStatus } from '$lib/server/submissionStore';
import { getInstallationToken } from '$lib/server/githubApp';
import { deleteBranch } from '$lib/server/github';
import { env as privateEnv } from '$env/dynamic/private';

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
	if (event !== 'pull_request') {
		return json({ ok: true }); // Ignore non-PR events
	}

	let payload: any;
	try {
		payload = JSON.parse(rawBody);
	} catch {
		return json({ error: 'Invalid JSON' }, { status: 400 });
	}

	const action = payload.action;
	const pr = payload.pull_request;

	if (!pr) return json({ ok: true });

	// Only care about PR close events
	if (action !== 'closed') {
		return json({ ok: true });
	}

	// 4. Look up UUID
	// Primary: extract from PR body HTML comment (stateless)
	let uuid = extractUuidFromBody(pr.body || '');

	// Fallback: look up in submission store by PR number
	if (!uuid) {
		uuid = getUuidByPrNumber(pr.number) ?? null;
	}

	if (!uuid) {
		// Not a bot-created PR, ignore
		return json({ ok: true });
	}

	// 5. Determine if merged or just closed
	const isMerged = pr.merged === true;
	const webhookEvent = isMerged ? 'merged' as const : 'closed' as const;

	// 6. Update status in store
	updateStatus(uuid, isMerged ? 'merged' : 'closed');

	// 7. Fire external webhook (fire-and-forget)
	sendWebhook({
		event: webhookEvent,
		uuid,
		prNumber: pr.number,
		timestamp: new Date().toISOString()
	});

	// 8. Clean up the head branch (best-effort, fire-and-forget)
	const headRef = pr.head?.ref;
	if (headRef?.startsWith('ofd-anon-')) {
		getInstallationToken()
			.then((token) =>
				deleteBranch(token, privateEnv.GITHUB_UPSTREAM_OWNER!, privateEnv.GITHUB_UPSTREAM_REPO!, headRef)
			)
			.catch((err: any) => console.warn(`Branch cleanup failed for ${headRef}:`, err.message));
	}

	return json({ ok: true, uuid, event: webhookEvent });
};
