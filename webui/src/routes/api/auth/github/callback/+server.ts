import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { PUBLIC_GITHUB_CLIENT_ID } from '$env/static/public';
import { GITHUB_CLIENT_SECRET } from '$env/static/private';
import { exchangeCodeForToken, setGitHubToken } from '$lib/server/auth';

export const GET: RequestHandler = async ({ url, cookies }) => {
	const code = url.searchParams.get('code');

	if (!code) {
		throw redirect(302, '/?auth_error=no_code');
	}

	if (!PUBLIC_GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
		throw redirect(302, '/?auth_error=not_configured');
	}

	let token: string;
	try {
		token = await exchangeCodeForToken(code, PUBLIC_GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET);
	} catch (error) {
		console.error('GitHub OAuth callback error:', error);
		throw redirect(302, '/?auth_error=exchange_failed');
	}

	setGitHubToken(cookies, token);
	throw redirect(302, '/?auth_success=true');
};
