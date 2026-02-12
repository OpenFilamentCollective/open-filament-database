import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { clearGitHubToken } from '$lib/server/auth';

export const POST: RequestHandler = async ({ cookies }) => {
	clearGitHubToken(cookies);
	return json({ success: true });
};
