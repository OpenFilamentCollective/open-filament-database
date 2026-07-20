import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/public';
import { env as privateEnv } from '$env/dynamic/private';
import { dev } from '$app/environment';
import crypto from 'crypto';

const STATE_COOKIE = 'ofd_gh_oauth_state';
const EMBED_COOKIE = 'ofd_gh_oauth_embed';
const POPUP_COOKIE = 'ofd_gh_oauth_popup';

export const GET: RequestHandler = async ({ url, cookies }) => {
	if (!env.PUBLIC_GITHUB_CLIENT_ID) {
		return new Response('GitHub OAuth not configured', { status: 500 });
	}

	// GitHub can't be framed either, so embedded logins run in a top-level popup
	// (first-party OFD, normal Lax cookies); the callback hands tokens back to the
	// frame. Legacy in-frame embed mode still uses partitioned cookies.
	const popup = url.searchParams.get('popup') === '1' || url.searchParams.get('popup') === 'true';
	const embedded =
		!popup &&
		(url.searchParams.get('embed') === '1' || url.searchParams.get('embed') === 'true');

	const state = crypto.randomUUID();

	const cookieOpts = {
		path: '/',
		httpOnly: true,
		secure: embedded ? true : !dev,
		sameSite: (embedded ? 'none' : 'lax') as 'none' | 'lax',
		...(embedded ? { partitioned: true } : {}),
		maxAge: 600
	};
	cookies.set(STATE_COOKIE, state, cookieOpts);
	if (embedded) cookies.set(EMBED_COOKIE, '1', cookieOpts);
	if (popup) cookies.set(POPUP_COOKIE, '1', cookieOpts);

	const redirectUri = privateEnv.GITHUB_REDIRECT_URI || (url.origin + '/api/auth/github/callback');
	const params = new URLSearchParams({
		client_id: env.PUBLIC_GITHUB_CLIENT_ID,
		redirect_uri: redirectUri,
		scope: 'public_repo workflow',
		state
	});

	throw redirect(302, `https://github.com/login/oauth/authorize?${params}`);
};
