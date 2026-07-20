import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { setGitHubToken } from '$lib/server/auth';
import { unseal } from '$lib/server/seal';

/**
 * Adopt a GitHub token obtained by the OAuth popup into THIS request's cookie
 * partition (the cross-site frame's). See the SimplyPrint adopt route for the
 * full rationale — GitHub can't be framed, so its embedded login runs in a popup
 * and hands the sealed token back for the frame to persist here.
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

	const data = unseal<{ access_token?: string }>(sealed);
	if (!data || !data.access_token) {
		return json({ ok: false, error: 'invalid_or_expired' }, { status: 400 });
	}

	setGitHubToken(cookies, data.access_token, true);
	return json({ ok: true });
};
