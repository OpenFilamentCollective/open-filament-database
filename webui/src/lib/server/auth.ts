/**
 * Server-side GitHub OAuth token management
 * Stores tokens in httpOnly cookies for security
 */

import type { Cookies } from '@sveltejs/kit';

const COOKIE_NAME = 'ofd_gh_token';
const COOKIE_OPTIONS = {
	path: '/',
	httpOnly: true,
	secure: false, // Set to true in production with HTTPS
	sameSite: 'lax' as const,
	maxAge: 60 * 60 * 24 * 30 // 30 days
};

export function getGitHubToken(cookies: Cookies): string | undefined {
	return cookies.get(COOKIE_NAME);
}

export function setGitHubToken(cookies: Cookies, token: string): void {
	cookies.set(COOKIE_NAME, token, COOKIE_OPTIONS);
}

export function clearGitHubToken(cookies: Cookies): void {
	cookies.delete(COOKIE_NAME, { path: '/' });
}

/**
 * Exchange an OAuth code for an access token
 */
export async function exchangeCodeForToken(
	code: string,
	clientId: string,
	clientSecret: string
): Promise<string> {
	const response = await fetch('https://github.com/login/oauth/access_token', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Accept: 'application/json'
		},
		body: JSON.stringify({
			client_id: clientId,
			client_secret: clientSecret,
			code
		})
	});

	const data = await response.json();

	if (data.error) {
		throw new Error(`GitHub OAuth error: ${data.error_description || data.error}`);
	}

	return data.access_token;
}

/**
 * Get the authenticated GitHub user
 */
export async function getGitHubUser(token: string): Promise<{ login: string; name: string; avatar_url: string }> {
	const response = await fetch('https://api.github.com/user', {
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/vnd.github+json'
		}
	});

	if (!response.ok) {
		throw new Error(`GitHub API error: ${response.status}`);
	}

	return response.json();
}
