import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/public';
import { env as privateEnv } from '$env/dynamic/private';
import { exchangeCodeForToken, setGitHubToken } from '$lib/server/auth';

const STATE_COOKIE = 'ofd_gh_oauth_state';

export const GET: RequestHandler = async ({ url, cookies }) => {
	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	const storedState = cookies.get(STATE_COOKIE);

	// Delete the state cookie immediately (single-use)
	cookies.delete(STATE_COOKIE, { path: '/' });

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
	throw redirect(302, '/?auth_success=true');
};
