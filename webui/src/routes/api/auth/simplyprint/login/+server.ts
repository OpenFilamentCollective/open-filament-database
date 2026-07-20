import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/public';
import { env as privateEnv } from '$env/dynamic/private';
import { dev } from '$app/environment';
import { SP_AUTHORIZE_URL } from '$lib/server/auth';
import crypto from 'crypto';

const STATE_COOKIE = 'ofd_sp_oauth_state';
const VERIFIER_COOKIE = 'ofd_sp_oauth_verifier';
const EMBED_COOKIE = 'ofd_sp_oauth_embed';
const POPUP_COOKIE = 'ofd_sp_oauth_popup';

const base64url = (buf: Buffer) =>
	buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export const GET: RequestHandler = async ({ url, cookies }) => {
	if (!env.PUBLIC_SIMPLYPRINT_CLIENT_ID) {
		return new Response('SimplyPrint OAuth not configured', { status: 500 });
	}

	// Embedded (iframe) logins need SameSite=None; Secure; Partitioned cookies —
	// a SameSite=Lax cookie is dropped by the browser inside a cross-site frame,
	// which would break the state/verifier round-trip.
	//
	// Popup logins run in a *top-level* window opened from the iframe (SimplyPrint
	// can't be framed, so we never navigate the frame to it). That window is
	// first-party OFD, so it uses normal Lax cookies for the state/verifier
	// round-trip; the callback then hands the tokens back to the frame (see
	// callback + adopt). Popup mode takes precedence over embed for the handshake.
	const popup = url.searchParams.get('popup') === '1' || url.searchParams.get('popup') === 'true';
	const embedded =
		!popup &&
		(url.searchParams.get('embed') === '1' || url.searchParams.get('embed') === 'true');

	const state = crypto.randomUUID();

	// PKCE: high-entropy verifier, sent as an S256 challenge now and as the raw
	// verifier at token exchange. SimplyPrint is a public (secret-less) client.
	const codeVerifier = base64url(crypto.randomBytes(32));
	const codeChallenge = base64url(crypto.createHash('sha256').update(codeVerifier).digest());

	const cookieOpts = {
		path: '/',
		httpOnly: true,
		secure: embedded ? true : !dev,
		sameSite: (embedded ? 'none' : 'lax') as 'none' | 'lax',
		...(embedded ? { partitioned: true } : {}),
		maxAge: 600
	};
	cookies.set(STATE_COOKIE, state, cookieOpts);
	cookies.set(VERIFIER_COOKIE, codeVerifier, cookieOpts);
	// Carry the embed flag to the callback so it stores the session token with
	// matching partitioned attributes and redirects back into embed mode.
	if (embedded) cookies.set(EMBED_COOKIE, '1', cookieOpts);
	// Carry the popup flag so the callback returns the postMessage handoff page
	// instead of redirecting.
	if (popup) cookies.set(POPUP_COOKIE, '1', cookieOpts);

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
