/**
 * GitHub App authentication for anonymous bot PR creation.
 * Generates JWTs and exchanges them for short-lived installation tokens.
 * No external dependencies — uses Node.js built-in crypto for RS256 signing.
 */
import crypto from 'crypto';
import { env as privateEnv } from '$env/dynamic/private';

// --- Types ---

interface InstallationToken {
	token: string;
	expiresAt: number; // Unix timestamp in ms
}

// --- Module-level cache ---

let cachedToken: InstallationToken | null = null;

// --- Helpers ---

/** URL-safe base64 encoding (no padding) */
function base64url(input: string | Buffer): string {
	const b64 = typeof input === 'string'
		? Buffer.from(input).toString('base64')
		: input.toString('base64');
	return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Parse private key from env var.
 * Handles both literal newlines and escaped \n in env vars.
 */
function parsePrivateKey(raw: string | undefined): string {
	if (!raw) throw new Error('GITHUB_APP_PRIVATE_KEY not configured');
	return raw.replace(/\\n/g, '\n');
}

// --- JWT Generation ---

/**
 * Create a JWT for GitHub App authentication.
 * Uses Node.js built-in crypto for RS256 signing.
 * JWT expires in 10 minutes (GitHub maximum).
 */
function createAppJwt(): string {
	const appId = privateEnv.GITHUB_APP_ID;
	if (!appId) throw new Error('GITHUB_APP_ID not configured');

	const privateKey = parsePrivateKey(privateEnv.GITHUB_APP_PRIVATE_KEY);

	const now = Math.floor(Date.now() / 1000);
	const header = { alg: 'RS256', typ: 'JWT' };
	const payload = {
		iat: now - 60,   // Issued 60s in past (clock skew tolerance)
		exp: now + 600,  // Expires in 10 minutes
		iss: appId
	};

	const segments = [
		base64url(JSON.stringify(header)),
		base64url(JSON.stringify(payload))
	];
	const signingInput = segments.join('.');

	const signature = crypto.sign('RSA-SHA256', Buffer.from(signingInput), privateKey);
	segments.push(base64url(signature));

	return segments.join('.');
}

// --- Installation Token ---

/** Refresh margin: get a new token when < 5 minutes remain */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

/**
 * Get a valid installation token, using cache if not expired.
 * Refreshes automatically when token has < 5 minutes remaining.
 */
export async function getInstallationToken(): Promise<string> {
	if (cachedToken && cachedToken.expiresAt - Date.now() > REFRESH_MARGIN_MS) {
		return cachedToken.token;
	}

	const jwt = createAppJwt();
	const installationId = privateEnv.GITHUB_APP_INSTALLATION_ID;
	if (!installationId) throw new Error('GITHUB_APP_INSTALLATION_ID not configured');

	const response = await fetch(
		`https://api.github.com/app/installations/${installationId}/access_tokens`,
		{
			method: 'POST',
			headers: {
				Authorization: `Bearer ${jwt}`,
				Accept: 'application/vnd.github+json'
			}
		}
	);

	if (!response.ok) {
		const body = await response.json().catch(() => ({}));
		throw new Error(
			`Failed to get installation token: ${response.status} - ${(body as any).message || 'Unknown error'}`
		);
	}

	const data = await response.json() as { token: string; expires_at: string };
	cachedToken = {
		token: data.token,
		expiresAt: new Date(data.expires_at).getTime()
	};

	return cachedToken.token;
}
