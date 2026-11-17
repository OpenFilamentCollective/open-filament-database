/**
 * Server-side OAuth token management for GitHub and SimplyPrint.
 * Stores tokens in httpOnly cookies for security.
 */

import type { Cookies } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';

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

/**
 * Where to send the user after GitHub login, or null when `path` is not safe.
 *
 * Only same-origin paths are accepted: `//evil.example` and `/\evil.example` are
 * protocol-relative to a browser, so they would turn the login into an open redirect.
 */
export function safeReturnPath(path: string | null | undefined): string | null {
	if (!path || !path.startsWith('/') || path.startsWith('//') || path.startsWith('/\\')) {
		return null;
	}
	return path;
}

export async function exchangeCodeForToken(
	code: string,
	clientId: string,
	clientSecret: string
): Promise<string> {
	// Trim to guard against stray whitespace/newlines pasted into env vars,
	// which the token endpoint rejects as incorrect_client_credentials.
	clientId = clientId.trim();
	clientSecret = clientSecret.trim();

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
		const body = await response.text();
		console.error('[GH OAuth] Token endpoint error:', response.status, body, {
			client_id: clientId
		});
		throw new Error('GitHub OAuth request failed: ' + response.status);
	}

	const data = await response.json();

	if (data.error) {
		// GitHub returns HTTP 200 with an { error } payload on failures.
		console.error('[GH OAuth] Token endpoint returned error:', data, { client_id: clientId });
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

/** Base URLs for SimplyPrint, configurable for test environments.
 * The API lives at {domain}/api (not an api.{domain} subdomain) — matching the
 * official Cura/Fusion/Blender integrations. */
const SP_DOMAIN = (env.SIMPLYPRINT_BASE_URL || 'simplyprint.io').replace(/^https?:\/\//, '');
// Strip any trailing slash so `${SP_API_BASE}/oauth2/Token` never doubles up.
const SP_API_BASE = (env.SIMPLYPRINT_API_URL || `https://${SP_DOMAIN}/api`).replace(/\/+$/, '');
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
	redirectUri: string,
	codeVerifier: string,
	clientSecret?: string
): Promise<{ access_token: string; refresh_token: string }> {
	// Trim to guard against stray whitespace/newlines pasted into env vars.
	clientId = clientId.trim();
	clientSecret = clientSecret?.trim();

	// The token endpoint expects application/x-www-form-urlencoded — a JSON body is
	// silently ignored and reported as invalid_client ("Client authentication failed").
	// PKCE (code_verifier) is always sent. A confidential client (one issued a secret,
	// like the OFD panel app) must also authenticate with client_secret; public
	// clients (the Cura/Fusion/Blender slug IDs) omit it.
	const form = new URLSearchParams({
		grant_type: 'authorization_code',
		client_id: clientId,
		code,
		redirect_uri: redirectUri,
		code_verifier: codeVerifier
	});
	if (clientSecret) form.set('client_secret', clientSecret);

	const response = await fetch(`${SP_API_BASE}/oauth2/Token`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: form
	});

	if (!response.ok) {
		const body = await response.text();
		// Log non-sensitive hints to disambiguate config issues (e.g. invalid_client).
		console.error('[SP OAuth] Token endpoint error:', response.status, body, {
			client_id: clientId,
			has_client_secret: !!clientSecret
		});
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

	if (!data.status || !data.user) {
		throw new Error('SimplyPrint TokenInfo: invalid response');
	}

	return {
		id: data.user.id,
		name: data.user.name,
		email: data.user.email,
		company_id: data.company?.id,
		company_name: data.company?.name
	};
}
