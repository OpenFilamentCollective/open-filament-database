/**
 * The maintainer PR picker's data: open PRs, plus PRs returned for changes in the last 30
 * days, with whether the signed-in maintainer can push a fix to each from the editor.
 * Gated like the merge page: a GitHub sign-in with write access to upstream.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env as privateEnv } from '$env/dynamic/private';
import { getGitHubToken, getGitHubUser } from '$lib/server/auth';
import {
	MERGE_PERMISSIONS,
	getRepoPermission,
	listPullRequests,
	type PullRequestListItem
} from '$lib/server/github';
import { countFeedback, prKind, type PrKind } from '$lib/server/feedback';
import { getOutcomes, type PrOutcome } from '$lib/server/prOutcomes';
import { isAnonBotEnabled } from '$lib/server/anonBot';
import { getReadToken } from '$lib/server/readToken';
import type { PickerRow } from '$lib/types/feedback';

const RETURNED_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

async function mapLimit<T, R>(
	items: T[],
	limit: number,
	fn: (item: T) => Promise<R>
): Promise<R[]> {
	const out: R[] = new Array(items.length);
	let next = 0;
	await Promise.all(
		Array.from({ length: Math.min(limit, items.length) }, async () => {
			while (next < items.length) {
				const i = next++;
				out[i] = await fn(items[i]);
			}
		})
	);
	return out;
}

function pushability(
	pr: PullRequestListItem,
	kind: PrKind,
	login: string,
	owner: string
): Pick<PickerRow, 'pushable' | 'pushReason'> {
	if (pr.state !== 'open')
		return {
			pushable: false,
			pushReason: 'Returned to its contributor; reopen it on GitHub to fix it yourself.'
		};
	if (kind === 'bot') {
		return isAnonBotEnabled()
			? { pushable: true }
			: { pushable: false, pushReason: 'The submission bot is not configured on this server.' };
	}
	if (!pr.head_owner) return { pushable: false, pushReason: 'The fork was deleted.' };
	if (pr.head_owner === login || pr.head_owner === owner || pr.maintainer_can_modify)
		return { pushable: true };
	return { pushable: false, pushReason: 'The author turned off "Allow edits by maintainers".' };
}

export const GET: RequestHandler = async ({ cookies }) => {
	const owner = privateEnv.GITHUB_UPSTREAM_OWNER;
	const repo = privateEnv.GITHUB_UPSTREAM_REPO;
	if (!owner || !repo)
		return json({ error: 'Upstream repository not configured' }, { status: 500 });

	const userToken = getGitHubToken(cookies);
	if (!userToken) return json({ error: 'Sign in with GitHub first.' }, { status: 401 });
	let login: string;
	try {
		login = (await getGitHubUser(userToken)).login;
	} catch {
		return json({ error: 'GitHub sign-in expired. Please sign in again.' }, { status: 401 });
	}
	const permission = await getRepoPermission(userToken, owner, repo, login).catch(() => 'none');
	if (!MERGE_PERMISSIONS.has(permission)) {
		return json({ error: 'You need write access to the repository.' }, { status: 403 });
	}

	try {
		const token = (await getReadToken(cookies)) ?? userToken;
		const [open, closed] = await Promise.all([
			listPullRequests(token, owner, repo, 'open', 100),
			listPullRequests(token, owner, repo, 'closed', 100)
		]);
		const outcomes: Map<number, PrOutcome> = await getOutcomes(closed.map((pr) => pr.number)).catch(
			() => new Map()
		);
		const now = Date.now();
		const returned = closed.filter((pr) => {
			const outcome = outcomes.get(pr.number);
			return (
				!pr.merged &&
				outcome?.outcome === 'returned' &&
				!outcome.supersededBy &&
				pr.closed_at !== null &&
				now - new Date(pr.closed_at).getTime() < RETURNED_WINDOW_MS
			);
		});

		const rows = await mapLimit([...open, ...returned], 8, async (pr): Promise<PickerRow> => {
			const kind = prKind(pr.head_ref);
			const feedbackCount = await countFeedback(pr.number, token).catch(() => null);
			return {
				number: pr.number,
				title: pr.title,
				url: pr.html_url,
				author: pr.author,
				kind,
				state: pr.state === 'open' ? 'open' : 'returned',
				updatedAt: pr.updated_at,
				feedbackCount,
				...pushability(pr, kind, login, owner)
			};
		});

		return json({ login, rows });
	} catch (err) {
		console.error('[Review] Listing PRs failed:', err);
		return json(
			{ error: (err as Error).message || 'Failed to list pull requests' },
			{ status: 502 }
		);
	}
};
