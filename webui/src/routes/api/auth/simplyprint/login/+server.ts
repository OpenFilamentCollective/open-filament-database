import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/public';
import { env as privateEnv } from '$env/dynamic/private';
import { dev } from '$app/environment';
import { SP_AUTHORIZE_URL } from '$lib/server/auth';
import crypto from 'crypto';

const STATE_COOKIE = 'ofd_sp_oauth_state';
const VERIFIER_COOKIE = 'ofd_sp_oauth_verifier';

const base64url = (buf: Buffer) =>
	buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export const GET: RequestHandler = async ({ url, cookies }) => {
	if (!env.PUBLIC_SIMPLYPRINT_CLIENT_ID) {
		return new Response('SimplyPrint OAuth not configured', { status: 500 });
	}

	const state = crypto.randomUUID();

	// PKCE: high-entropy verifier, sent as an S256 challenge now and as the raw
	// verifier at token exchange. SimplyPrint is a public (secret-less) client.
	const codeVerifier = base64url(crypto.randomBytes(32));
	const codeChallenge = base64url(crypto.createHash('sha256').update(codeVerifier).digest());

	const cookieOpts = {
		path: '/',
		httpOnly: true,
		secure: !dev,
		sameSite: 'lax' as const,
		maxAge: 600
	};
	cookies.set(STATE_COOKIE, state, cookieOpts);
	cookies.set(VERIFIER_COOKIE, codeVerifier, cookieOpts);

	const redirectUri =
		privateEnv.SIMPLYPRINT_REDIRECT_URI || url.origin + '/api/auth/simplyprint/callback';
	const params = new URLSearchParams({
		client_id: env.PUBLIC_SIMPLYPRINT_CLIENT_ID,
		redirect_uri: redirectUri,
		response_type: 'code',
		scope: 'user.read',
		state,
		code_challenge: codeChallenge,
		code_challenge_method: 'S256'
	});

	throw redirect(302, `${SP_AUTHORIZE_URL}?${params}`);
};
