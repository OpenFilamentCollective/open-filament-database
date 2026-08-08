import { env as publicEnv } from '$env/dynamic/public';

/**
 * Known embed wrappers allowed to set PR attribution. Restricting to an
 * allowlist prevents an embedded client from injecting an arbitrary string
 * into public PR bodies ("Submitted via <anything>").
 */
const ALLOWED_WRAPPERS: Record<string, string> = {
	simplyprint: 'SimplyPrint'
};

/**
 * Resolve the attribution label for a submission.
 *
 * @param requested wrapper slug sent by an embedded client (e.g. "SimplyPrint")
 * @returns the validated display name, else the global PUBLIC_WRAPPER_NAME, else undefined
 */
export function resolveWrapperName(requested?: unknown): string | undefined {
	if (typeof requested === 'string') {
		const match = ALLOWED_WRAPPERS[requested.trim().toLowerCase()];
		if (match) return match;
	}
	return publicEnv.PUBLIC_WRAPPER_NAME || undefined;
}
