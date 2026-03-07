import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/public';
import { env as privateEnv } from '$env/dynamic/private';
import { dev } from '$app/environment';
import { SP_AUTHORIZE_URL } from '$lib/server/auth';
import crypto from 'crypto';

const STATE_COOKIE = 'ofd_sp_oauth_state';

export const GET: RequestHandler = async ({ url, cookies }) => {
	if (!env.PUBLIC_SIMPLYPRINT_CLIENT_ID) {
		return new Response('SimplyPrint OAuth not configured', { status: 500 });
	}

	const state = crypto.randomUUID();

	cookies.set(STATE_COOKIE, state, {
		path: '/',
		httpOnly: true,
		secure: !dev,
		sameSite: 'lax',
		maxAge: 600
	});

	const redirectUri =
		privateEnv.SIMPLYPRINT_REDIRECT_URI || url.origin + '/api/auth/simplyprint/callback';
	const params = new URLSearchParams({
		client_id: env.PUBLIC_SIMPLYPRINT_CLIENT_ID,
		redirect_uri: redirectUri,
		response_type: 'code',
		scope: 'user.read',
		state
	});

	throw redirect(302, `${SP_AUTHORIZE_URL}?${params}`);
};
