import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/public';
import { env as privateEnv } from '$env/dynamic/private';
import {
	exchangeSimplyPrintCode,
	setSimplyPrintToken,
	setSimplyPrintRefreshToken
} from '$lib/server/auth';

const STATE_COOKIE = 'ofd_sp_oauth_state';
const VERIFIER_COOKIE = 'ofd_sp_oauth_verifier';
const EMBED_COOKIE = 'ofd_sp_oauth_embed';

/** Preserve embed mode across the OAuth redirect back into the app. */
function successRedirect(embedded: boolean): string {
	return embedded ? '/?embed=1&sp_auth_success=true' : '/?sp_auth_success=true';
}

export const GET: RequestHandler = async ({ url, cookies }) => {
	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	const storedState = cookies.get(STATE_COOKIE);
	const codeVerifier = cookies.get(VERIFIER_COOKIE);
	const embedded = cookies.get(EMBED_COOKIE) === '1';

	cookies.delete(STATE_COOKIE, { path: '/' });
	cookies.delete(VERIFIER_COOKIE, { path: '/' });
	cookies.delete(EMBED_COOKIE, { path: '/' });
	cookies.delete(EMBED_COOKIE, { path: '/', partitioned: true } as never);

	if (!state || !storedState || state !== storedState) {
		console.error('[SP OAuth] State mismatch:', { state, storedState: storedState ? '(present)' : '(missing)' });
		throw redirect(302, '/?sp_auth_error=invalid_state');
	}

	if (!code) {
		console.error('[SP OAuth] No code in callback URL');
		throw redirect(302, '/?sp_auth_error=no_code');
	}

	if (!codeVerifier) {
		console.error('[SP OAuth] Missing PKCE verifier cookie');
		throw redirect(302, '/?sp_auth_error=invalid_state');
	}

	if (!env.PUBLIC_SIMPLYPRINT_CLIENT_ID) {
		console.error('[SP OAuth] Missing client ID');
		throw redirect(302, '/?sp_auth_error=not_configured');
	}

	const redirectUri =
		privateEnv.SIMPLYPRINT_REDIRECT_URI || url.origin + '/api/auth/simplyprint/callback';

	try {
		console.log('[SP OAuth] Exchanging code, redirect_uri:', redirectUri);
		const tokens = await exchangeSimplyPrintCode(
			code,
			env.PUBLIC_SIMPLYPRINT_CLIENT_ID,
			redirectUri,
			codeVerifier,
			privateEnv.SIMPLYPRINT_CLIENT_SECRET
		);
		console.log('[SP OAuth] Token exchange successful');
		setSimplyPrintToken(cookies, tokens.access_token, embedded);
		if (tokens.refresh_token) {
			setSimplyPrintRefreshToken(cookies, tokens.refresh_token, embedded);
		}
	} catch (error) {
		console.error('[SP OAuth] Token exchange failed:', error);
		throw redirect(302, embedded ? '/?embed=1&sp_auth_error=exchange_failed' : '/?sp_auth_error=exchange_failed');
	}

	throw redirect(302, successRedirect(embedded));
};
