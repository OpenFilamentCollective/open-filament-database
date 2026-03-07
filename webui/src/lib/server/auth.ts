/**
 * Server-side OAuth token management for GitHub and SimplyPrint.
 * Stores tokens in httpOnly cookies for security.
 */

import type { Cookies } from '@sveltejs/kit';
import { dev } from '$app/environment';

const GH_COOKIE = 'ofd_gh_token';
const SP_COOKIE = 'ofd_sp_token';

const COOKIE_OPTIONS = {
	path: '/',
	httpOnly: true,
	secure: !dev,
	sameSite: 'lax' as const,
	maxAge: 60 * 60 * 24 * 30 // 30 days
};

// --- GitHub ---

export function getGitHubToken(cookies: Cookies): string | undefined {
	return cookies.get(GH_COOKIE);
}

export function setGitHubToken(cookies: Cookies, token: string): void {
	cookies.set(GH_COOKIE, token, COOKIE_OPTIONS);
}

export function clearGitHubToken(cookies: Cookies): void {
	cookies.delete(GH_COOKIE, { path: '/' });
}

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

	if (!response.ok) {
		throw new Error('GitHub OAuth request failed: ' + response.status);
	}

	const data = await response.json();

	if (data.error) {
		throw new Error(`GitHub OAuth error: ${data.error_description || data.error}`);
	}

	return data.access_token;
}

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

// --- SimplyPrint ---

/** Base URLs for SimplyPrint, configurable for test environments */
const SP_DOMAIN = process.env.SIMPLYPRINT_BASE_URL || 'simplyprint.io';
const SP_API_BASE = process.env.SIMPLYPRINT_API_URL || `https://api.${SP_DOMAIN}`;
export const SP_AUTHORIZE_URL = `https://${SP_DOMAIN}/panel/oauth2/authorize`;

export function getSimplyPrintToken(cookies: Cookies): string | undefined {
	return cookies.get(SP_COOKIE);
}

export function setSimplyPrintToken(cookies: Cookies, token: string): void {
	cookies.set(SP_COOKIE, token, { ...COOKIE_OPTIONS, maxAge: 3600 });
}

export function clearSimplyPrintToken(cookies: Cookies): void {
	cookies.delete(SP_COOKIE, { path: '/' });
}

export async function exchangeSimplyPrintCode(
	code: string,
	clientId: string,
	clientSecret: string,
	redirectUri: string
): Promise<{ access_token: string; refresh_token: string }> {
	const response = await fetch(`${SP_API_BASE}/oauth2/Token`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			grant_type: 'authorization_code',
			client_id: clientId,
			client_secret: clientSecret,
			code,
			redirect_uri: redirectUri
		})
	});

	if (!response.ok) {
		const body = await response.text();
		console.error('[SP OAuth] Token endpoint error:', response.status, body);
		throw new Error('SimplyPrint OAuth request failed: ' + response.status);
	}

	const data = await response.json();

	if (data.error) {
		console.error('[SP OAuth] Token endpoint returned error:', data);
		throw new Error(`SimplyPrint OAuth error: ${data.error_description || data.error}`);
	}

	return data;
}

export interface SimplyPrintUser {
	id: number;
	name: string;
	email: string;
	company_id: number;
	company_name: string;
}

export async function getSimplyPrintUser(token: string): Promise<SimplyPrintUser> {
	const response = await fetch(`${SP_API_BASE}/oauth2/TokenInfo`, {
		headers: { Authorization: `Bearer ${token}` }
	});

	if (!response.ok) {
		throw new Error(`SimplyPrint API error: ${response.status}`);
	}

	const data = await response.json();
	console.log('[SP OAuth] TokenInfo response:', JSON.stringify(data));
	return data;
}
