import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/public';
import { env as privateEnv } from '$env/dynamic/private';
import { exchangeCodeForToken, safeReturnPath, setGitHubToken } from '$lib/server/auth';

const STATE_COOKIE = 'ofd_gh_oauth_state';
const RETURN_COOKIE = 'ofd_gh_oauth_return';

export const GET: RequestHandler = async ({ url, cookies }) => {
	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	const storedState = cookies.get(STATE_COOKIE);
	const returnTo = safeReturnPath(cookies.get(RETURN_COOKIE));

	// Delete the state and return cookies immediately (single-use)
	cookies.delete(STATE_COOKIE, { path: '/' });
	cookies.delete(RETURN_COOKIE, { path: '/' });

	if (!state || !storedState || state !== storedState) {
		throw redirect(302, '/?auth_error=invalid_state');
	}

	if (!code) {
		throw redirect(302, '/?auth_error=no_code');
	}

	if (!env.PUBLIC_GITHUB_CLIENT_ID || !privateEnv.GITHUB_CLIENT_SECRET) {
		throw redirect(302, '/?auth_error=not_configured');
	}

	let token: string;
	try {
		token = await exchangeCodeForToken(code, env.PUBLIC_GITHUB_CLIENT_ID, privateEnv.GITHUB_CLIENT_SECRET);
	} catch (error) {
		console.error('GitHub OAuth callback error:', error);
		throw redirect(302, '/?auth_error=exchange_failed');
	}

	setGitHubToken(cookies, token);
	throw redirect(302, returnTo ?? '/?auth_success=true');
};
