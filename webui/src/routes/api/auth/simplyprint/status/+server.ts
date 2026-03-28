import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSimplyPrintToken, getSimplyPrintUser } from '$lib/server/auth';
import { env } from '$env/dynamic/private';

const SP_API_BASE =
	env.SIMPLYPRINT_API_URL ||
	`https://api.${(env.SIMPLYPRINT_BASE_URL || 'simplyprint.io').replace(/^https?:\/\//, '')}`;

/** Resolve the profile picture redirect to get the final CDN URL */
async function resolveAvatarUrl(userId: number): Promise<string | null> {
	try {
		const res = await fetch(
			`${SP_API_BASE}/users/profilepicture/GetUserProfilePicture?user_id=${userId}`,
			{ redirect: 'manual' }
		);
		if (res.status >= 300 && res.status < 400) {
			return res.headers.get('location');
		}
		if (res.ok && res.headers.get('content-type')?.startsWith('image/')) {
			return res.url;
		}
	} catch {
		// Ignore — avatar is non-critical
	}
	return null;
}

export const GET: RequestHandler = async ({ cookies }) => {
	const token = getSimplyPrintToken(cookies);

	if (!token) {
		return json({ authenticated: false });
	}

	try {
		const user = await getSimplyPrintUser(token);
		const avatar_url = await resolveAvatarUrl(user.id);
		return json({
			authenticated: true,
			user: {
				id: user.id,
				name: user.name,
				email: user.email,
				company_name: user.company_name,
				avatar_url
			}
		});
	} catch {
		cookies.delete('ofd_sp_token', { path: '/' });
		return json({ authenticated: false });
	}
};
