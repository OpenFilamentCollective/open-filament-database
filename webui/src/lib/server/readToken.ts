/**
 * A token for *reading* the upstream repository on a visitor's behalf.
 *
 * Prefers the GitHub App's installation token (higher rate limit, works for signed-out
 * visitors), then the visitor's own GitHub sign-in. Returns null when neither exists;
 * GraphQL, which the feedback builder uses, has no anonymous access.
 */
import type { Cookies } from '@sveltejs/kit';
import { env as privateEnv } from '$env/dynamic/private';
import { getInstallationToken } from '$lib/server/githubApp';
import { getGitHubToken } from '$lib/server/auth';

export async function getReadToken(cookies?: Cookies): Promise<string | null> {
	if (privateEnv.GITHUB_APP_ID && privateEnv.GITHUB_APP_INSTALLATION_ID) {
		try {
			return await getInstallationToken();
		} catch (err) {
			console.warn(
				'[GitHub] App token unavailable, falling back to the user token:',
				(err as Error).message
			);
		}
	}
	return cookies ? (getGitHubToken(cookies) ?? null) : null;
}

/** The public URL of this web editor, for links in emails and PR comments. */
export function webuiUrl(): string {
	return (privateEnv.OFD_WEBUI_URL || '').replace(/\/+$/, '');
}

/** Absolute link to a PR's feedback page, or a site-relative one when the URL isn't set. */
export function submissionUrl(prNumber: number): string {
	return `${webuiUrl()}/submissions/${prNumber}`;
}
