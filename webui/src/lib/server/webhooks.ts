/**
 * Webhook management for anonymous submission lifecycle.
 *
 * Outgoing: notify external system about PR events (HMAC-SHA256 signed)
 * Incoming: validate GitHub webhook signatures
 */
import { env as privateEnv } from '$env/dynamic/private';
import crypto from 'crypto';

// --- Outgoing webhook types ---

export type WebhookEvent = 'submitted' | 'merged' | 'closed';

interface WebhookPayloadSubmitted {
	event: 'submitted';
	uuid: string;
	email?: string;
	prNumber: number;
	prUrl: string;
	timestamp: string;
}

interface WebhookPayloadMerged {
	event: 'merged';
	uuid: string;
	prNumber: number;
	timestamp: string;
}

interface WebhookPayloadClosed {
	event: 'closed';
	uuid: string;
	prNumber: number;
	timestamp: string;
}

export type WebhookPayload = WebhookPayloadSubmitted | WebhookPayloadMerged | WebhookPayloadClosed;

function getWebhookUrl(event: WebhookEvent): string | undefined {
	switch (event) {
		case 'submitted': return privateEnv.WEBHOOK_URL_SUBMITTED || undefined;
		case 'merged': return privateEnv.WEBHOOK_URL_MERGED || undefined;
		case 'closed': return privateEnv.WEBHOOK_URL_CLOSED || undefined;
	}
}

/** Sign a payload with HMAC-SHA256 using WEBHOOK_SECRET */
function signPayload(payload: string): string | undefined {
	const secret = privateEnv.WEBHOOK_SECRET;
	if (!secret) return undefined;
	return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Send a webhook to the external system.
 * Fire-and-forget with retry (1 attempt + 2 retries).
 * Logs errors but never throws.
 */
export async function sendWebhook(payload: WebhookPayload): Promise<void> {
	const url = getWebhookUrl(payload.event);
	if (!url) return; // Webhook not configured for this event

	const body = JSON.stringify(payload);
	const signature = signPayload(body);

	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
		'X-OFD-Event': payload.event
	};
	if (signature) {
		headers['X-OFD-Signature'] = `sha256=${signature}`;
	}

	for (let attempt = 0; attempt < 3; attempt++) {
		try {
			const response = await fetch(url, {
				method: 'POST',
				headers,
				body,
				signal: AbortSignal.timeout(10_000)
			});
			if (response.ok) return;
			console.warn(`Webhook ${payload.event} attempt ${attempt + 1} failed: HTTP ${response.status}`);
		} catch (err: any) {
			console.warn(`Webhook ${payload.event} attempt ${attempt + 1} error: ${err.message}`);
		}
		// Wait before retry (exponential backoff: 1s, 2s)
		if (attempt < 2) await new Promise(r => setTimeout(r, (attempt + 1) * 1000));
	}
	console.error(`Webhook ${payload.event} for UUID ${payload.uuid} failed after 3 attempts`);
}

// --- Incoming GitHub webhook verification ---

/**
 * Verify a GitHub webhook signature using GITHUB_WEBHOOK_SECRET.
 */
export function verifyGitHubSignature(payload: string, signatureHeader: string | null): boolean {
	const secret = privateEnv.GITHUB_WEBHOOK_SECRET;
	if (!secret) return false;
	if (!signatureHeader) return false;

	const expected = `sha256=${crypto.createHmac('sha256', secret).update(payload).digest('hex')}`;

	if (expected.length !== signatureHeader.length) return false;
	return crypto.timingSafeEqual(
		Buffer.from(signatureHeader),
		Buffer.from(expected)
	);
}
