/**
 * GitHub hosts, overridable for testing against a local fake GitHub
 * (see scripts/fake-github/). Production leaves both unset.
 */
import { env } from '$env/dynamic/private';

const trim = (u: string) => u.replace(/\/+$/, '');

/** REST + GraphQL API base, e.g. https://api.github.com */
export function githubApiUrl(): string {
	return trim(env.GITHUB_API_URL || 'https://api.github.com');
}

/** Web host used for OAuth, e.g. https://github.com */
export function githubWebUrl(): string {
	return trim(env.GITHUB_WEB_URL || 'https://github.com');
}
