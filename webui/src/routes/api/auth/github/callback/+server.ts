import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/public';
import { env as privateEnv } from '$env/dynamic/private';
import { exchangeCodeForToken, setGitHubToken } from '$lib/server/auth';
import { seal } from '$lib/server/seal';
import { popupHandoffPage } from '$lib/server/popupHandoff';

const STATE_COOKIE = 'ofd_gh_oauth_state';
const EMBED_COOKIE = 'ofd_gh_oauth_embed';
const POPUP_COOKIE = 'ofd_gh_oauth_popup';

export const GET: RequestHandler = async ({ url, cookies }) => {
	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	const storedState = cookies.get(STATE_COOKIE);
	const embedded = cookies.get(EMBED_COOKIE) === '1';
	const popup = cookies.get(POPUP_COOKIE) === '1';
	const q = embedded ? 'embed=1&' : '';

	// Delete the state cookie immediately (single-use)
	cookies.delete(STATE_COOKIE, { path: '/' });
	cookies.delete(EMBED_COOKIE, { path: '/' });
	cookies.delete(EMBED_COOKIE, { path: '/', partitioned: true } as never);
	cookies.delete(POPUP_COOKIE, { path: '/' });

	// Popup mode: hand the outcome back to the opener frame instead of redirecting.
	const fail = (reason: string): Response => {
		if (popup) return popupHandoffPage(url.origin, 'github', { error: reason });
		throw redirect(302, `/?${q}auth_error=${reason}`);
	};

	if (!state || !storedState || state !== storedState) {
		return fail('invalid_state');
	}

	if (!code) {
		return fail('no_code');
	}

	if (!env.PUBLIC_GITHUB_CLIENT_ID || !privateEnv.GITHUB_CLIENT_SECRET) {
		return fail('not_configured');
	}

	let token: string;
	try {
		token = await exchangeCodeForToken(code, env.PUBLIC_GITHUB_CLIENT_ID, privateEnv.GITHUB_CLIENT_SECRET);
	} catch (error) {
		console.error('GitHub OAuth callback error:', error);
		return fail('exchange_failed');
	}

	if (popup) {
		const sealed = seal({ access_token: token });
		return popupHandoffPage(url.origin, 'github', { sealed });
	}

	setGitHubToken(cookies, token, embedded);
	throw redirect(302, `/?${q}auth_success=true`);
};
