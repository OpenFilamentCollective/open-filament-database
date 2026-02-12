import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { PUBLIC_GITHUB_CLIENT_ID } from '$env/static/public';

export const GET: RequestHandler = async ({ url }) => {
	if (!PUBLIC_GITHUB_CLIENT_ID) {
		return new Response('GitHub OAuth not configured', { status: 500 });
	}

	const redirectUri = url.origin + '/api/auth/github/callback';
	const params = new URLSearchParams({
		client_id: PUBLIC_GITHUB_CLIENT_ID,
		redirect_uri: redirectUri,
		scope: 'public_repo workflow'
	});

	throw redirect(302, `https://github.com/login/oauth/authorize?${params}`);
};
