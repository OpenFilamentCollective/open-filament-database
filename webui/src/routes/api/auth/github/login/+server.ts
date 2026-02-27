import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/public';
import { env as privateEnv } from '$env/dynamic/private';
import { dev } from '$app/environment';
import crypto from 'crypto';

const STATE_COOKIE = 'ofd_gh_oauth_state';

export const GET: RequestHandler = async ({ url, cookies }) => {
	if (!env.PUBLIC_GITHUB_CLIENT_ID) {
		return new Response('GitHub OAuth not configured', { status: 500 });
	}

	const state = crypto.randomUUID();

	cookies.set(STATE_COOKIE, state, {
		path: '/',
		httpOnly: true,
		secure: !dev,
		sameSite: 'lax',
		maxAge: 600
	});

	const redirectUri = privateEnv.GITHUB_REDIRECT_URI || (url.origin + '/api/auth/github/callback');
	const params = new URLSearchParams({
		client_id: env.PUBLIC_GITHUB_CLIENT_ID,
		redirect_uri: redirectUri,
		scope: 'public_repo workflow',
		state
	});

	throw redirect(302, `https://github.com/login/oauth/authorize?${params}`);
};
