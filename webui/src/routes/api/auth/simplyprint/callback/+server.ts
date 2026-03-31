import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/public';
import { env as privateEnv } from '$env/dynamic/private';
import { exchangeSimplyPrintCode, setSimplyPrintToken } from '$lib/server/auth';

const STATE_COOKIE = 'ofd_sp_oauth_state';

export const GET: RequestHandler = async ({ url, cookies }) => {
	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	const storedState = cookies.get(STATE_COOKIE);

	cookies.delete(STATE_COOKIE, { path: '/' });

	if (!state || !storedState || state !== storedState) {
		console.error('[SP OAuth] State mismatch:', { state, storedState: storedState ? '(present)' : '(missing)' });
		throw redirect(302, '/?sp_auth_error=invalid_state');
	}

	if (!code) {
		console.error('[SP OAuth] No code in callback URL');
		throw redirect(302, '/?sp_auth_error=no_code');
	}

	if (!env.PUBLIC_SIMPLYPRINT_CLIENT_ID || !privateEnv.SIMPLYPRINT_CLIENT_SECRET) {
		console.error('[SP OAuth] Missing client credentials');
		throw redirect(302, '/?sp_auth_error=not_configured');
	}

	const redirectUri =
		privateEnv.SIMPLYPRINT_REDIRECT_URI || url.origin + '/api/auth/simplyprint/callback';

	try {
		console.log('[SP OAuth] Exchanging code, redirect_uri:', redirectUri);
		const tokens = await exchangeSimplyPrintCode(
			code,
			env.PUBLIC_SIMPLYPRINT_CLIENT_ID,
			privateEnv.SIMPLYPRINT_CLIENT_SECRET,
			redirectUri
		);
		console.log('[SP OAuth] Token exchange successful');
		setSimplyPrintToken(cookies, tokens.access_token);
	} catch (error) {
		console.error('[SP OAuth] Token exchange failed:', error);
		throw redirect(302, '/?sp_auth_error=exchange_failed');
	}

	throw redirect(302, '/?sp_auth_success=true');
};
