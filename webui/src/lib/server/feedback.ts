/**
 * Review feedback on a pull request, collected for the contributor.
 *
 * Maintainers write feedback the way they always have, as comments on GitHub. This module
 * decides which of those comments a contributor should be shown, maps inline comments to
 * the entity and field they are about, and is the single source for every surface that
 * shows feedback: the `/submissions/[pr]` page, the editor's feedback banners, the
 * "returned" email and the sticky PR comment.
 *
 * The rules (agreed with the maintainers; see docs/webui.md "Review feedback"):
 * - Every human comment counts: conversation comments, review bodies, inline comments.
 * - Of the bots, only the inline findings of the *latest* AI review count. Earlier AI runs
 *   repeat themselves, and the summary comment is a dashboard, not feedback.
 * - A comment that starts with "note" (any case, e.g. "Note to self:") never counts. That is
 *   how maintainers write to each other on a PR.
 * - Nothing in a resolved thread counts. Resolving a thread is how a single item is dismissed.
 * - A "reject" comment is the reason for a rejection, not feedback (see `rejectComment`).
 * - The PR author's own comments, slash commands and dismissed reviews never count.
 */
import {
	parseTree,
	findNodeAtOffset,
	findNodeAtLocation,
	getNodePath,
	type Node as JsonNode
} from 'jsonc-parser';
import { env as privateEnv } from '$env/dynamic/private';
import { githubGraphQL, getFileTextAtRef } from '$lib/server/github';
import { repoPathToEntityPath } from '$lib/server/prBuilder';

// --- Types (shared with the browser; see $lib/types/feedback.ts) ---

import type {
	PrKind,
	FeedbackLocation,
	FeedbackItem,
	RejectComment,
	PrSummary,
	PrFeedback
} from '$lib/types/feedback';
export type { PrKind, FeedbackLocation, FeedbackItem, RejectComment, PrSummary, PrFeedback };

// --- Rules ---

/** Login of the Actions bot that posts the AI review, as GraphQL spells it (no `[bot]`). */
export const AI_REVIEW_LOGIN = 'github-actions';

const NOTE = /^[\s>*_~`#-]*notes?\b/i;
const REJECT = /^[\s>*_~`#-]*reject(?:ed|ing)?\b[\s:.,-]*/i;
const COMMAND = /^\s*\//;

export function isNote(body: string): boolean {
	return NOTE.test(body);
}

/** The rejection reason when `body` is a "Reject…" comment, else null. */
export function rejectReason(body: string): string | null {
	const match = REJECT.exec(body);
	if (!match) return null;
	return body.slice(match[0].length).trim();
}

/**
 * Which submission path opened a PR, from its branch name: the bot pushes `ofd-anon-<uuid>`
 * to upstream, the signed-in flow pushes `ofd-changes-<timestamp>` to the user's fork.
 * Both carry the submission UUID marker in the body, so the branch is what tells them apart.
 */
export function prKind(headRef: string): PrKind {
	if (headRef.startsWith('ofd-anon-')) return 'bot';
	if (headRef.startsWith('ofd-changes-')) return 'fork';
	return 'other';
}

/** True for a PR the web editor opened, the only kind the feedback loop acts on. */
export function isWebEditorPr(kind: PrKind): boolean {
	return kind === 'bot' || kind === 'fork';
}

/**
 * Turn a GitHub comment body into text a contributor can read without GitHub's renderer.
 * HTML comments (bot markers) go, images become their URL, and a suggestion block is
 * labelled as the value the reviewer proposes.
 */
export function cleanBody(body: string): string {
	return (
		body
			.replace(/<!--[\s\S]*?-->/g, '')
			.replace(/<img\b[^>]*\bsrc="([^"]+)"[^>]*>/gi, '[image: $1]')
			.replace(/```suggestion[^\n]*\n([\s\S]*?)```/g, (_m, inner: string) => {
				const text = inner.replace(/\n$/, '');
				return text.trim() ? `Suggested change:\n${text}` : 'Suggested change: remove these lines';
			})
			// The AI review tags each finding "_(unverified: AI opinion)_"; every surface already
			// marks automated items as unverified, so the tag is just noise there.
			.replace(/\s*_\(unverified[^)]*\)_/g, '')
			.replace(/\r\n/g, '\n')
			.replace(/\n{3,}/g, '\n\n')
			.trim()
	);
}

function excerpt(body: string, max = 200): string {
	const text = cleanBody(body).replace(/\s+/g, ' ');
	return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

// --- Raw GraphQL shape (exported for tests) ---

export interface RawAuthor {
	login: string;
	__typename: string;
}

export interface RawComment {
	databaseId: number;
	body: string;
	url: string;
	createdAt: string;
	author: RawAuthor | null;
}

export interface RawThreadComment extends RawComment {
	pullRequestReview: { databaseId: number } | null;
	replyTo: { databaseId: number } | null;
	commit: { oid: string } | null;
	originalCommit: { oid: string } | null;
}

export interface RawReview extends RawComment {
	state: string;
	submittedAt: string | null;
}

export interface RawThread {
	isResolved: boolean;
	isOutdated: boolean;
	path: string;
	line: number | null;
	originalLine: number | null;
	diffSide: 'LEFT' | 'RIGHT';
	comments: { nodes: RawThreadComment[] };
}

export interface RawPullRequest {
	number: number;
	title: string;
	url: string;
	state: 'OPEN' | 'CLOSED' | 'MERGED';
	merged: boolean;
	updatedAt: string;
	closedAt: string | null;
	body: string;
	author: RawAuthor | null;
	headRefName: string;
	headRefOid: string;
	headRepository: { name: string; owner: { login: string } } | null;
	maintainerCanModify: boolean;
	comments: { totalCount: number; nodes: RawComment[] };
	reviews: { totalCount: number; nodes: RawReview[] };
	reviewThreads: { totalCount: number; nodes: RawThread[] };
}

const PAGE = 100;

const FEEDBACK_QUERY = `
query PrFeedback($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      number title url state merged updatedAt closedAt body
      author { login __typename }
      headRefName headRefOid
      headRepository { name owner { login } }
      maintainerCanModify
      comments(first: ${PAGE}) {
        totalCount
        nodes { databaseId body url createdAt author { login __typename } }
      }
      reviews(first: ${PAGE}) {
        totalCount
        nodes { databaseId body url createdAt state submittedAt author { login __typename } }
      }
      reviewThreads(first: ${PAGE}) {
        totalCount
        nodes {
          isResolved isOutdated path line originalLine diffSide
          comments(first: 50) {
            nodes {
              databaseId body url createdAt
              author { login __typename }
              pullRequestReview { databaseId }
              replyTo { databaseId }
              commit { oid }
              originalCommit { oid }
            }
          }
        }
      }
    }
  }
}`;

// --- Selection (pure; the rules above live here) ---

function isBot(author: RawAuthor | null): boolean {
	return author?.__typename === 'Bot';
}

function login(author: RawAuthor | null): string {
	return author?.login ?? 'ghost';
}

export function summarizePr(raw: RawPullRequest): PrSummary {
	return {
		number: raw.number,
		title: raw.title,
		url: raw.url,
		state: raw.state === 'OPEN' ? 'open' : 'closed',
		merged: raw.merged,
		author: login(raw.author),
		authorIsBot: isBot(raw.author),
		headRef: raw.headRefName,
		headSha: raw.headRefOid,
		headOwner: raw.headRepository?.owner.login ?? null,
		headRepo: raw.headRepository?.name ?? null,
		maintainerCanModify: raw.maintainerCanModify,
		kind: prKind(raw.headRefName),
		updatedAt: raw.updatedAt,
		closedAt: raw.closedAt
	};
}

/**
 * Apply the feedback rules to a PR's comments. Locations carry the file and line but no
 * pointer yet; `getPrFeedback` fills those in from the file contents.
 */
export function selectFeedback(raw: RawPullRequest): PrFeedback {
	const pr = summarizePr(raw);
	const prAuthor = pr.authorIsBot ? null : pr.author;
	const items: FeedbackItem[] = [];
	let rejectComment: RejectComment | null = null;

	/** A human comment that may be shown, after the note/command/author rules. */
	const humanEligible = (c: RawComment): boolean =>
		!isBot(c.author) &&
		login(c.author) !== prAuthor &&
		c.body.trim() !== '' &&
		!isNote(c.body) &&
		!COMMAND.test(c.body);

	const considerReject = (c: RawComment) => {
		if (isBot(c.author) || login(c.author) === prAuthor) return false;
		const reason = rejectReason(c.body);
		if (reason === null) return false;
		if (!rejectComment || c.createdAt >= rejectComment.createdAt) {
			rejectComment = { author: login(c.author), reason, createdAt: c.createdAt, url: c.url };
		}
		return true;
	};

	// Conversation comments.
	for (const c of raw.comments.nodes) {
		if (considerReject(c)) continue;
		if (!humanEligible(c)) continue;
		items.push({
			id: `c${c.databaseId}`,
			kind: 'comment',
			source: 'maintainer',
			author: login(c.author),
			body: cleanBody(c.body),
			url: c.url,
			createdAt: c.createdAt,
			outdated: false
		});
	}

	// Review bodies. A dismissed review was withdrawn; a pending one isn't submitted yet.
	let latestAiReview: RawReview | null = null;
	for (const r of raw.reviews.nodes) {
		if (r.state === 'PENDING') continue;
		if (isBot(r.author) && login(r.author) === AI_REVIEW_LOGIN) {
			const at = r.submittedAt ?? r.createdAt;
			if (!latestAiReview || at >= (latestAiReview.submittedAt ?? latestAiReview.createdAt)) {
				latestAiReview = r;
			}
			continue;
		}
		if (r.state === 'DISMISSED') continue;
		if (considerReject(r)) continue;
		if (!humanEligible(r)) continue;
		items.push({
			id: `r${r.databaseId}`,
			kind: 'review',
			source: 'maintainer',
			author: login(r.author),
			body: cleanBody(r.body),
			url: r.url,
			createdAt: r.submittedAt ?? r.createdAt,
			outdated: false
		});
	}
	const latestAiReviewId = (latestAiReview as RawReview | null)?.databaseId ?? null;

	// Inline threads.
	for (const thread of raw.reviewThreads.nodes) {
		if (thread.isResolved) continue;
		const byId = new Map(thread.comments.nodes.map((c) => [c.databaseId, c]));
		for (const c of thread.comments.nodes) {
			const fromLatestAi =
				isBot(c.author) &&
				login(c.author) === AI_REVIEW_LOGIN &&
				latestAiReviewId !== null &&
				c.pullRequestReview?.databaseId === latestAiReviewId;
			if (!fromLatestAi) {
				if (considerReject(c)) continue;
				if (!humanEligible(c)) continue;
			}
			const parent = c.replyTo ? byId.get(c.replyTo.databaseId) : undefined;
			const useOriginal = thread.isOutdated || thread.line === null;
			items.push({
				id: `t${c.databaseId}`,
				kind: 'inline',
				source: fromLatestAi ? 'ai' : 'maintainer',
				author: login(c.author),
				body: cleanBody(c.body),
				url: c.url,
				createdAt: c.createdAt,
				outdated: thread.isOutdated,
				context: parent
					? { author: login(parent.author), excerpt: excerpt(parent.body) }
					: undefined,
				location: {
					repoPath: thread.path,
					line: (useOriginal ? thread.originalLine : thread.line) ?? null,
					entityPath: null,
					entityType: null,
					pointer: null,
					label: null
				}
			});
		}
	}

	const truncated =
		raw.comments.totalCount > raw.comments.nodes.length ||
		raw.reviews.totalCount > raw.reviews.nodes.length ||
		raw.reviewThreads.totalCount > raw.reviewThreads.nodes.length;

	items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
	return { pr, items, rejectComment, truncated };
}

// --- Line → JSON pointer ---

function escapePointer(segment: string | number): string {
	return String(segment).replace(/~/g, '~0').replace(/\//g, '~1');
}

/**
 * The JSON path of whatever starts on `line` (1-based) of a JSON document: the property
 * whose key is on that line, or the array element that starts there. Returns null when
 * the text isn't JSON or the line is out of range. A line holding only closing brackets
 * resolves to the enclosing container.
 */
export function jsonPathAtLine(text: string, line: number): (string | number)[] | null {
	const lines = text.split('\n');
	if (!Number.isInteger(line) || line < 1 || line > lines.length) return null;
	const root = parseTree(text);
	if (!root) return null;

	let offset = 0;
	for (let i = 0; i < line - 1; i++) offset += lines[i].length + 1;
	const content = lines[line - 1];
	const indent = content.length - content.trimStart().length;
	let node: JsonNode | undefined = findNodeAtOffset(root, offset + indent, false);
	if (!node) return [];
	// Landing on a property's key, or between key and value, means the property itself.
	if (node.type === 'property' && node.children?.[0]) node = node.children[0];
	return getNodePath(node);
}

/**
 * The inverse of `jsonPathAtLine`: the 1-based line where the value at `path` starts (its
 * key's line, for a property). Null when the path isn't in the document.
 */
export function lineOfPath(text: string, path: (string | number)[]): number | null {
	const root = parseTree(text);
	if (!root) return null;
	const node = findNodeAtLocation(root, path);
	if (!node) return null;
	const offset = node.parent?.type === 'property' ? node.parent.offset : node.offset;
	return text.slice(0, offset).split('\n').length;
}

export function pointerFromPath(prefix: string, path: (string | number)[]): string {
	return prefix + path.map((s) => `/${escapePointer(s)}`).join('');
}

/** `/sizes/0/purchase_links/1/url` → `sizes › 1 › purchase links › 2 › url` (1-based). */
export function labelFromPointer(pointer: string): string | null {
	if (!pointer) return null;
	return pointer
		.split('/')
		.slice(1)
		.map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'))
		.map((s) => (/^\d+$/.test(s) ? String(Number(s) + 1) : s.replace(/_/g, ' ')))
		.join(' › ');
}

// --- Fetching ---

function upstream(): { owner: string; repo: string } {
	const owner = privateEnv.GITHUB_UPSTREAM_OWNER;
	const repo = privateEnv.GITHUB_UPSTREAM_REPO;
	if (!owner || !repo)
		throw new Error('GITHUB_UPSTREAM_OWNER / GITHUB_UPSTREAM_REPO are not configured');
	return { owner, repo };
}

/** Fill in each inline item's entity and pointer from the commented file's contents. */
async function locate(token: string, raw: RawPullRequest, feedback: PrFeedback): Promise<void> {
	const { owner, repo } = upstream();
	const files = new Map<string, Promise<string | null>>();
	const fileAt = (path: string, ref: string) => {
		const key = `${ref}:${path}`;
		if (!files.has(key)) {
			files.set(
				key,
				getFileTextAtRef(token, owner, repo, path, ref).catch(() => null)
			);
		}
		return files.get(key)!;
	};

	// Which commit each inline comment's line refers to.
	const commitFor = new Map<string, { ref: string | null; side: 'LEFT' | 'RIGHT' }>();
	for (const thread of raw.reviewThreads.nodes) {
		const useOriginal = thread.isOutdated || thread.line === null;
		for (const c of thread.comments.nodes) {
			commitFor.set(`t${c.databaseId}`, {
				ref: useOriginal ? (c.originalCommit?.oid ?? null) : (c.commit?.oid ?? raw.headRefOid),
				side: thread.diffSide
			});
		}
	}

	await Promise.all(
		feedback.items.map(async (item) => {
			const loc = item.location;
			if (!loc) return;
			const entity = repoPathToEntityPath(loc.repoPath);
			if (!entity) return;
			loc.entityPath = entity.entityPath;
			loc.entityType = entity.type;
			// A comment on a removed line (LEFT side) points into the old file; the entity is
			// still right, but there is no field to point at in the PR's version.
			const commit = commitFor.get(item.id);
			if (!entity.isEntityJson || !loc.line || !commit?.ref || commit.side === 'LEFT') return;
			const text = await fileAt(loc.repoPath, commit.ref);
			if (text === null) return;
			const path = jsonPathAtLine(text, loc.line);
			if (path === null) return;
			loc.pointer = pointerFromPath(entity.pointerPrefix, path);
			loc.label = labelFromPointer(loc.pointer);
		})
	);
}

const CACHE_TTL_MS = 60_000;
const rawCache = new Map<number, { at: number; raw: RawPullRequest }>();
const cache = new Map<number, { updatedAt: string; value: PrFeedback }>();

/** Drop the cached feedback for a PR, e.g. after a push or a webhook event. */
export function invalidateFeedback(prNumber: number): void {
	rawCache.delete(prNumber);
	cache.delete(prNumber);
}

async function fetchRawPr(prNumber: number, token: string): Promise<RawPullRequest | null> {
	const hit = rawCache.get(prNumber);
	if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.raw;
	const { owner, repo } = upstream();
	const data = await githubGraphQL<{ repository: { pullRequest: RawPullRequest | null } | null }>(
		token,
		FEEDBACK_QUERY,
		{ owner, repo, number: prNumber }
	);
	const raw = data.repository?.pullRequest ?? null;
	if (raw) rawCache.set(prNumber, { at: Date.now(), raw });
	return raw;
}

/** How many feedback items a PR has, without locating them (the maintainer PR list). */
export async function countFeedback(prNumber: number, token: string): Promise<number> {
	const raw = await fetchRawPr(prNumber, token);
	return raw ? selectFeedback(raw).items.length : 0;
}

/**
 * Collect the feedback on a PR. `token` must be able to read the upstream repo; GraphQL
 * has no anonymous access. Returns null when the PR doesn't exist.
 */
export async function getPrFeedback(prNumber: number, token: string): Promise<PrFeedback | null> {
	const raw = await fetchRawPr(prNumber, token);
	if (!raw) return null;

	const hit = cache.get(prNumber);
	if (hit && hit.updatedAt === raw.updatedAt) return hit.value;

	const feedback = selectFeedback(raw);
	if (feedback.truncated) {
		console.warn(
			`[Feedback] PR #${prNumber} has more than ${PAGE} comments, reviews or threads; older ones are not shown`
		);
	}
	await locate(token, raw, feedback);
	cache.set(prNumber, { updatedAt: raw.updatedAt, value: feedback });
	return feedback;
}

/** Render feedback as plain text, for emails and the outgoing webhook. */
export function feedbackToText(items: FeedbackItem[]): string {
	return items
		.map((item, i) => {
			const where = item.location
				? `${item.location.entityPath ?? item.location.repoPath}${item.location.label ? ` (${item.location.label})` : ''}`
				: 'General';
			const who = item.source === 'ai' ? 'Automated review' : item.author;
			return `${i + 1}. ${where}, from ${who}:\n${item.body}`;
		})
		.join('\n\n');
}
