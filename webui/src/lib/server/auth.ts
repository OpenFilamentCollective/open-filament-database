/**
 * Server-side OAuth token management for GitHub and SimplyPrint.
 * Stores tokens in httpOnly cookies for security.
 */

import type { Cookies } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';

const GH_COOKIE = 'ofd_gh_token';
const SP_COOKIE = 'ofd_sp_token';
const SP_REFRESH_COOKIE = 'ofd_sp_refresh';

const THIRTY_DAYS = 60 * 60 * 24 * 30;
const ONE_YEAR = 60 * 60 * 24 * 365;

/**
 * Cookie attributes. When the app runs inside a cross-site iframe (the
 * SimplyPrint panel modal), browsers will NOT send SameSite=Lax cookies, so the
 * OAuth handshake + session must use SameSite=None; Secure; Partitioned (CHIPS).
 * SameSite=None requires Secure — localhost is a secure context in Chrome, so
 * embedded cookies are always marked Secure (works over http://localhost too).
 */
function cookieOptions(embedded = false, maxAge = THIRTY_DAYS) {
	return {
		path: '/',
		httpOnly: true,
		secure: embedded ? true : !dev,
		sameSite: (embedded ? 'none' : 'lax') as 'none' | 'lax',
		...(embedded ? { partitioned: true } : {}),
		maxAge
	};
}

/** Delete a cookie in both partitioned and unpartitioned jars. */
function clearCookie(cookies: Cookies, name: string): void {
	cookies.delete(name, { path: '/' });
	// Partitioned cookies live in a separate jar keyed by the top-level site.
	cookies.delete(name, { path: '/', partitioned: true } as Parameters<Cookies['delete']>[1]);
}

// --- GitHub ---

export function getGitHubToken(cookies: Cookies): string | undefined {
	return cookies.get(GH_COOKIE);
}

export function setGitHubToken(cookies: Cookies, token: string, embedded = false): void {
	cookies.set(GH_COOKIE, token, cookieOptions(embedded));
}

export function clearGitHubToken(cookies: Cookies): void {
	clearCookie(cookies, GH_COOKIE);
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

/** Store the short-lived access token (1h — matches SimplyPrint token lifetime). */
export function setSimplyPrintToken(cookies: Cookies, token: string, embedded = false): void {
	cookies.set(SP_COOKIE, token, cookieOptions(embedded, 3600));
}

export function getSimplyPrintRefreshToken(cookies: Cookies): string | undefined {
	return cookies.get(SP_REFRESH_COOKIE);
}

/**
 * Store the long-lived refresh token (SimplyPrint refresh tokens last ~1 year)
 * so an expired access token can be renewed silently — no re-consent, which is
 * what makes the embedded "one-time consent" login feel seamless on later opens.
 */
export function setSimplyPrintRefreshToken(cookies: Cookies, token: string, embedded = false): void {
	cookies.set(SP_REFRESH_COOKIE, token, cookieOptions(embedded, ONE_YEAR));
}

export function clearSimplyPrintToken(cookies: Cookies): void {
	clearCookie(cookies, SP_COOKIE);
	clearCookie(cookies, SP_REFRESH_COOKIE);
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

/**
 * Exchange a refresh token for a fresh access token (refresh_token grant).
 * Used to silently renew an expired session without re-prompting for consent.
 */
export async function refreshSimplyPrintToken(
	refreshToken: string,
	clientId: string,
	clientSecret?: string
): Promise<{ access_token: string; refresh_token?: string }> {
	clientId = clientId.trim();
	clientSecret = clientSecret?.trim();

	const form = new URLSearchParams({
		grant_type: 'refresh_token',
		client_id: clientId,
		refresh_token: refreshToken
	});
	if (clientSecret) form.set('client_secret', clientSecret);

	const response = await fetch(`${SP_API_BASE}/oauth2/Token`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: form
	});

	if (!response.ok) {
		const body = await response.text();
		console.error('[SP OAuth] Refresh endpoint error:', response.status, body, {
			client_id: clientId,
			has_client_secret: !!clientSecret
		});
		throw new Error('SimplyPrint token refresh failed: ' + response.status);
	}

	const data = await response.json();
	if (data.error) {
		console.error('[SP OAuth] Refresh returned error:', data);
		throw new Error(`SimplyPrint refresh error: ${data.error_description || data.error}`);
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
