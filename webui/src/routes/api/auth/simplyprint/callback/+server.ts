import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/public';
import { env as privateEnv } from '$env/dynamic/private';
import {
	exchangeSimplyPrintCode,
	setSimplyPrintToken,
	setSimplyPrintRefreshToken
} from '$lib/server/auth';
import { seal } from '$lib/server/seal';
import { popupHandoffPage } from '$lib/server/popupHandoff';

const STATE_COOKIE = 'ofd_sp_oauth_state';
const VERIFIER_COOKIE = 'ofd_sp_oauth_verifier';
const EMBED_COOKIE = 'ofd_sp_oauth_embed';
const POPUP_COOKIE = 'ofd_sp_oauth_popup';

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
	const popup = cookies.get(POPUP_COOKIE) === '1';

	cookies.delete(STATE_COOKIE, { path: '/' });
	cookies.delete(VERIFIER_COOKIE, { path: '/' });
	cookies.delete(EMBED_COOKIE, { path: '/' });
	cookies.delete(EMBED_COOKIE, { path: '/', partitioned: true } as never);
	cookies.delete(POPUP_COOKIE, { path: '/' });

	// In popup mode we can't redirect back into the (partitioned) frame — the
	// popup is a separate top-level window. Instead we render a tiny page that
	// hands the outcome back to the opener frame over postMessage and closes.
	const fail = (reason: string): Response => {
		if (popup) return popupHandoffPage(url.origin, 'simplyprint', { error: reason });
		throw redirect(302, embedded ? `/?embed=1&sp_auth_error=${reason}` : `/?sp_auth_error=${reason}`);
	};

	if (!state || !storedState || state !== storedState) {
		console.error('[SP OAuth] State mismatch:', { state, storedState: storedState ? '(present)' : '(missing)' });
		return fail('invalid_state');
	}

	if (!code) {
		console.error('[SP OAuth] No code in callback URL');
		return fail('no_code');
	}

	if (!codeVerifier) {
		console.error('[SP OAuth] Missing PKCE verifier cookie');
		return fail('invalid_state');
	}

	if (!env.PUBLIC_SIMPLYPRINT_CLIENT_ID) {
		console.error('[SP OAuth] Missing client ID');
		return fail('not_configured');
	}

	const redirectUri =
		privateEnv.SIMPLYPRINT_REDIRECT_URI || url.origin + '/api/auth/simplyprint/callback';

	let tokens: { access_token: string; refresh_token: string };
	try {
		console.log('[SP OAuth] Exchanging code, redirect_uri:', redirectUri);
		tokens = await exchangeSimplyPrintCode(
			code,
			env.PUBLIC_SIMPLYPRINT_CLIENT_ID,
			redirectUri,
			codeVerifier,
			privateEnv.SIMPLYPRINT_CLIENT_SECRET
		);
		console.log('[SP OAuth] Token exchange successful');
	} catch (error) {
		console.error('[SP OAuth] Token exchange failed:', error);
		return fail('exchange_failed');
	}

	if (popup) {
		// Don't write the session in this (wrong) partition — seal the tokens and
		// let the frame adopt them into its own partition (see /adopt).
		const sealed = seal({
			access_token: tokens.access_token,
			refresh_token: tokens.refresh_token ?? null
		});
		return popupHandoffPage(url.origin, 'simplyprint', { sealed });
	}

	setSimplyPrintToken(cookies, tokens.access_token, embedded);
	if (tokens.refresh_token) {
		setSimplyPrintRefreshToken(cookies, tokens.refresh_token, embedded);
	}

	throw redirect(302, successRedirect(embedded));
};
