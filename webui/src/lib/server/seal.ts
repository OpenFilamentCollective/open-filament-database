/**
 * Short-lived sealed envelopes for the embedded OAuth popup handoff.
 *
 * When the OFD editor runs inside the SimplyPrint panel (a cross-site iframe),
 * the OAuth provider (SimplyPrint, GitHub) cannot be framed — so we run the
 * whole OAuth round-trip in a *popup* (a top-level window where the provider is
 * first-party and framing is a non-issue). The popup ends up holding the tokens
 * in ITS cookie partition (keyed to the OFD origin), which the iframe — living
 * in the host's partition (keyed to simplyprint.io) — cannot read.
 *
 * To bridge the two partitions we hand the tokens from the popup back to the
 * iframe over `postMessage`, then the iframe re-submits them to `/adopt` so the
 * session cookie is written in the iframe's own partition. To avoid exposing
 * long-lived tokens to page scripts in plaintext, the handoff value is a sealed
 * (AES-256-GCM encrypted + authenticated) opaque blob with a short TTL. Page
 * scripts only ever see ciphertext; only the OFD server can open it.
 *
 * This is stateless (no server-side session store) so it survives multi-instance
 * / serverless cloud deploys.
 */
import crypto from 'crypto';
import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';

const DEFAULT_TTL_MS = 2 * 60 * 1000; // 2 minutes — the popup→iframe handoff is immediate.

function key(): Buffer {
	// A stable per-deploy secret. Prefer a dedicated secret; fall back to other
	// deploy-stable values so embedding works out of the box. The secret never
	// leaves the server — the sealed blob's confidentiality is what matters.
	const secret =
		env.OFD_EMBED_SEAL_SECRET ||
		env.SIMPLYPRINT_CLIENT_SECRET ||
		publicEnv.PUBLIC_SIMPLYPRINT_CLIENT_ID ||
		'ofd-embed-oauth-handoff';
	return crypto.createHash('sha256').update(secret).digest();
}

const b64url = (buf: Buffer) =>
	buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function fromB64url(s: string): Buffer {
	return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

/** Encrypt + authenticate a small JSON payload into a short-lived opaque token. */
export function seal(payload: Record<string, unknown>, ttlMs = DEFAULT_TTL_MS): string {
	const iv = crypto.randomBytes(12);
	const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
	const body = JSON.stringify({ ...payload, exp: Date.now() + ttlMs });
	const ct = Buffer.concat([cipher.update(body, 'utf8'), cipher.final()]);
	const tag = cipher.getAuthTag();
	return b64url(Buffer.concat([iv, tag, ct]));
}

/** Open a sealed token. Returns null if tampered, malformed, or expired. */
export function unseal<T = Record<string, unknown>>(sealed: string): T | null {
	try {
		const buf = fromB64url(sealed);
		if (buf.length < 28) return null;
		const iv = buf.subarray(0, 12);
		const tag = buf.subarray(12, 28);
		const ct = buf.subarray(28);
		const decipher = crypto.createDecipheriv('aes-256-gcm', key(), iv);
		decipher.setAuthTag(tag);
		const pt = Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
		const data = JSON.parse(pt) as { exp?: number } & T;
		if (!data.exp || Date.now() > data.exp) return null;
		return data;
	} catch {
		return null;
	}
}
