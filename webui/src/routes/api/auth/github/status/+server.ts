import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getGitHubToken, getGitHubUser } from '$lib/server/auth';

export const GET: RequestHandler = async ({ cookies }) => {
	const token = getGitHubToken(cookies);

	if (!token) {
		return json({ authenticated: false });
	}

	try {
		const user = await getGitHubUser(token);
		return json({
			authenticated: true,
			user: {
				login: user.login,
				name: user.name,
				avatar_url: user.avatar_url
			}
		});
	} catch (error) {
		// Token might be expired or revoked
		return json({ authenticated: false });
	}
};
