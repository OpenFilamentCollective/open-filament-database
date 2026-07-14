import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getSimplyPrintToken,
	getSimplyPrintRefreshToken,
	setSimplyPrintToken,
	setSimplyPrintRefreshToken,
	clearSimplyPrintToken,
	refreshSimplyPrintToken,
	getSimplyPrintUser
} from '$lib/server/auth';
import type { Cookies } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';

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

/** Silently mint a fresh access token from the stored refresh token. */
async function tryRefresh(cookies: Cookies, embedded: boolean): Promise<string | undefined> {
	const refreshToken = getSimplyPrintRefreshToken(cookies);
	const clientId = publicEnv.PUBLIC_SIMPLYPRINT_CLIENT_ID;
	if (!refreshToken || !clientId) return undefined;

	try {
		const tokens = await refreshSimplyPrintToken(refreshToken, clientId, env.SIMPLYPRINT_CLIENT_SECRET);
		setSimplyPrintToken(cookies, tokens.access_token, embedded);
		if (tokens.refresh_token) {
			// SimplyPrint rotates refresh tokens — persist the new one.
			setSimplyPrintRefreshToken(cookies, tokens.refresh_token, embedded);
		}
		return tokens.access_token;
	} catch {
		return undefined;
	}
}

async function respondWithUser(token: string) {
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
}

export const GET: RequestHandler = async ({ url, cookies }) => {
	const embedded = url.searchParams.get('embed') === '1' || url.searchParams.get('embed') === 'true';
	let token = getSimplyPrintToken(cookies);

	// No access token — attempt a silent refresh (keeps the "one-time consent"
	// login alive for ~1 year without re-prompting).
	if (!token) {
		token = await tryRefresh(cookies, embedded);
		if (!token) return json({ authenticated: false });
	}

	try {
		return await respondWithUser(token);
	} catch {
		// Access token likely expired/revoked — one refresh attempt, then retry.
		const refreshed = await tryRefresh(cookies, embedded);
		if (refreshed) {
			try {
				return await respondWithUser(refreshed);
			} catch {
				/* fall through to unauthenticated */
			}
		}
		clearSimplyPrintToken(cookies);
		return json({ authenticated: false });
	}
};
