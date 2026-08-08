import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { setSimplyPrintToken, setSimplyPrintRefreshToken } from '$lib/server/auth';
import { unseal } from '$lib/server/seal';

/**
 * Adopt tokens obtained by the OAuth popup into THIS request's cookie partition.
 *
 * The popup ran the OAuth handshake in a first-party OFD window and sealed the
 * resulting tokens; it handed the sealed blob to the opener iframe over
 * postMessage. This endpoint is called from inside that iframe (so its
 * Set-Cookie lands in the host's partition — SameSite=None; Secure; Partitioned)
 * to persist the session where the frame can actually read it later.
 */
export const POST: RequestHandler = async ({ request, cookies }) => {
	let sealed: unknown;
	try {
		({ sealed } = await request.json());
	} catch {
		return json({ ok: false, error: 'bad_request' }, { status: 400 });
	}

	if (typeof sealed !== 'string' || !sealed) {
		return json({ ok: false, error: 'missing_sealed' }, { status: 400 });
	}

	const data = unseal<{ access_token?: string; refresh_token?: string | null }>(sealed);
	if (!data || !data.access_token) {
		// Tampered, malformed, or expired (the handoff is meant to be immediate).
		return json({ ok: false, error: 'invalid_or_expired' }, { status: 400 });
	}

	// Always partitioned here — the adopt call originates from the cross-site frame.
	setSimplyPrintToken(cookies, data.access_token, true);
	if (data.refresh_token) {
		setSimplyPrintRefreshToken(cookies, data.refresh_token, true);
	}

	return json({ ok: true });
};
