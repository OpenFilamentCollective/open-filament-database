import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { clearSimplyPrintToken } from '$lib/server/auth';

export const POST: RequestHandler = async ({ cookies }) => {
	clearSimplyPrintToken(cookies);
	return json({ success: true });
};
