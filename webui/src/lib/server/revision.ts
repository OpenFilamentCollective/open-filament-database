/**
 * Revising a PR from the web editor: who may, and how the fix reaches GitHub.
 *
 * - An **open** PR gets the fix pushed onto its branch (`pushRevision`).
 * - A **returned** PR (closed with feedback, see prOutcomes.ts) is resubmitted as a new PR
 *   that names the old one (`resubmitReturned`).
 *
 * The editor always sends the *whole* change set it loaded from the PR (prChanges.ts) plus
 * the contributor's edits. A push therefore builds the tree from current `main` plus that
 * change set, and commits it as a merge of the branch head and `main`. The PR's diff then
 * equals the editor's change set exactly: an item the contributor dropped reverts by itself,
 * and the branch catches up with main on the way.
 */
import type { Cookies } from '@sveltejs/kit';
import crypto from 'crypto';
import { env as privateEnv } from '$env/dynamic/private';
import {
	MERGE_PERMISSIONS,
	getRepoPermission,
	getLatestCommitSha,
	getCommitTreeSha,
	getRecursiveTree,
	getMergeBase,
	getPullRequestFiles,
	createTree,
	createCommit,
	updateRef,
	updatePullRequest,
	createIssueComment,
	createReview,
	getFileTextAtRef,
	type PullRequestDetails
} from '$lib/server/github';
import { getInstallationToken } from '$lib/server/githubApp';
import {
	getGitHubToken,
	getGitHubUser,
	getSimplyPrintToken,
	getSimplyPrintUser
} from '$lib/server/auth';
import {
	buildTreeItems,
	buildChangesSummary,
	explainEmptyTree,
	repoPathToEntityPath,
	entityPathToRepoPath,
	type TreeItem
} from '$lib/server/prBuilder';
import { createAnonPR, isAnonBotEnabled } from '$lib/server/anonBot';
import { createForkPR } from '$lib/server/forkPr';
import { prKind, lineOfPath, labelFromPointer, type PrKind } from '$lib/server/feedback';
import type { PrOutcome } from '$lib/server/prOutcomes';
import type { SubmissionRecord } from '$lib/server/submissionStore';

// --- Access ---

export type ReviseAs = 'submitter' | 'maintainer';
/** `bot`: the server's GitHub App pushes. `user-token`: the signed-in user's own token does. */
export type ReviseVia = 'bot' | 'user-token';
export type ReviseMode = 'amend' | 'resubmit';

export interface ReviseAccess {
	allowed: boolean;
	as?: ReviseAs;
	via?: ReviseVia;
	mode?: ReviseMode;
	/** Why revising isn't possible, when `allowed` is false. */
	reason?: string;
	/** Signing in with this would (or might) allow it. */
	signIn?: 'github' | 'simplyprint';
	kind: PrKind;
	/** The signed-in GitHub user, if any. */
	login?: string;
	isMaintainer: boolean;
}

interface Viewer {
	github?: { token: string; login: string };
	simplyprint?: { email: string | undefined };
}

async function viewer(cookies: Cookies): Promise<Viewer> {
	const v: Viewer = {};
	const gh = getGitHubToken(cookies);
	if (gh) {
		try {
			v.github = { token: gh, login: (await getGitHubUser(gh)).login };
		} catch {
			// Expired or revoked: treat as signed out.
		}
	}
	const sp = getSimplyPrintToken(cookies);
	if (sp) {
		try {
			v.simplyprint = { email: (await getSimplyPrintUser(sp)).email };
		} catch {
			// Expired (the cookie lives an hour): treat as signed out.
		}
	}
	return v;
}

function upstream(): { owner: string; repo: string } {
	const owner = privateEnv.GITHUB_UPSTREAM_OWNER;
	const repo = privateEnv.GITHUB_UPSTREAM_REPO;
	if (!owner || !repo)
		throw new Error('GITHUB_UPSTREAM_OWNER / GITHUB_UPSTREAM_REPO are not configured');
	return { owner, repo };
}

/**
 * Decide whether the current visitor may load PR `pr` into the editor and push a fix.
 * The submitter wins over the maintainer role when someone is both.
 */
export async function checkReviseAccess(
	cookies: Cookies,
	pr: PullRequestDetails,
	record: SubmissionRecord | undefined,
	outcome: PrOutcome | undefined
): Promise<ReviseAccess> {
	const kind = prKind(pr.head_ref);
	const v = await viewer(cookies);
	const login = v.github?.login;

	let isMaintainer = false;
	if (v.github) {
		try {
			const { owner, repo } = upstream();
			const permission = await getRepoPermission(v.github.token, owner, repo, v.github.login);
			isMaintainer = MERGE_PERMISSIONS.has(permission);
		} catch {
			isMaintainer = false;
		}
	}
	const base = { kind, login, isMaintainer };
	const deny = (reason: string, signIn?: ReviseAccess['signIn']): ReviseAccess => ({
		...base,
		allowed: false,
		reason,
		signIn
	});

	if (pr.merged) return deny('This pull request has already been merged.');

	let mode: ReviseMode;
	if (pr.state === 'open') {
		mode = 'amend';
	} else if (outcome?.outcome === 'returned' && !outcome.supersededBy) {
		mode = 'resubmit';
	} else if (outcome?.supersededBy) {
		return deny(`This submission was already resubmitted as #${outcome.supersededBy}.`);
	} else if (outcome?.outcome === 'rejected') {
		return deny(
			outcome.reason
				? `This submission was rejected: ${outcome.reason}`
				: 'This submission was rejected.'
		);
	} else {
		return deny('This pull request is closed.');
	}

	// The submitter.
	if (
		kind === 'bot' &&
		record?.email &&
		v.simplyprint?.email &&
		record.email === v.simplyprint.email
	) {
		if (!isAnonBotEnabled()) return deny('The submission bot is not configured on this server.');
		return { ...base, allowed: true, as: 'submitter', via: 'bot', mode };
	}
	if (kind === 'fork' && login && login.toLowerCase() === pr.author.toLowerCase()) {
		if (mode === 'amend' && !pr.head_owner)
			return deny('The fork this pull request came from was deleted.');
		return { ...base, allowed: true, as: 'submitter', via: 'user-token', mode };
	}

	// A maintainer.
	if (isMaintainer) {
		if (mode === 'resubmit') {
			return deny(
				'This pull request was returned to its contributor. Reopen it on GitHub to fix it yourself.'
			);
		}
		if (kind === 'bot') {
			if (!isAnonBotEnabled()) return deny('The submission bot is not configured on this server.');
			return { ...base, allowed: true, as: 'maintainer', via: 'bot', mode };
		}
		const { owner } = upstream();
		if (!pr.head_owner) return deny('The fork this pull request came from was deleted.');
		if (pr.head_owner === login || pr.head_owner === owner || pr.maintainer_can_modify) {
			return { ...base, allowed: true, as: 'maintainer', via: 'user-token', mode };
		}
		return deny('The author turned off "Allow edits by maintainers" on this pull request.');
	}

	if (kind === 'bot') {
		return deny(
			v.simplyprint
				? 'This submission was made by a different SimplyPrint account.'
				: 'Sign in with the SimplyPrint account that made this submission.',
			v.simplyprint ? undefined : 'simplyprint'
		);
	}
	if (kind === 'fork') {
		return deny(
			login
				? `Only @${pr.author} or a maintainer can revise this pull request.`
				: 'Sign in with GitHub to revise this pull request.',
			login ? undefined : 'github'
		);
	}
	return deny(
		login
			? 'Only maintainers can load this pull request into the editor.'
			: 'Sign in with GitHub to load this pull request.',
		login ? undefined : 'github'
	);
}

/** The token that pushes for `access`: the GitHub App's, or the visitor's own. */
export async function pushToken(access: ReviseAccess, cookies: Cookies): Promise<string> {
	if (access.via === 'bot') return getInstallationToken();
	const token = getGitHubToken(cookies);
	if (!token) throw new Error('GitHub sign-in expired. Please sign in again.');
	return token;
}

// --- PR body ---

/**
 * Rewrite the `## Changes` list of a web-editor PR body, keeping everything else (the UUID
 * marker, the contributor's description, the footer) byte for byte.
 */
export function replaceChangesSection(body: string, changes: any[]): string {
	const summary = buildChangesSummary(changes).split('\n');
	const lines = body.split('\n');
	const start = lines.findIndex((l) => l.trim() === '## Changes');
	if (start === -1) {
		const footer = lines.findIndex((l) => l.startsWith('*Submitted '));
		const block = ['## Changes', ...summary, ''];
		if (footer === -1) return [...lines, '', ...block].join('\n').trimEnd() + '\n';
		return [...lines.slice(0, footer), ...block, ...lines.slice(footer)].join('\n');
	}
	let end = start + 1;
	while (
		end < lines.length &&
		!lines[end].startsWith('## ') &&
		!lines[end].startsWith('*Submitted ')
	)
		end++;
	// Keep the blank line that separated the list from what follows.
	while (end > start + 1 && lines[end - 1].trim() === '') end--;
	return [...lines.slice(0, start + 1), ...summary, ...lines.slice(end)].join('\n');
}

// --- Push onto an open PR ---

export class RevisionConflictError extends Error {}

export interface PushResult {
	commitSha: string | null;
	/** The change set produced exactly the branch's current tree: nothing was committed. */
	unchanged: boolean;
	skippedPaths: string[];
	noopDeletes: string[];
}

/**
 * Commit the editor's full change set onto an open PR's branch, as a merge of the branch
 * head and current main. Throws `RevisionConflictError` when the branch moved since the
 * editor loaded it (`expectedHeadSha`).
 */
export async function pushRevision(opts: {
	token: string;
	pr: PullRequestDetails;
	expectedHeadSha: string;
	changes: any[];
	images?: Record<string, any>;
	message: string;
}): Promise<PushResult> {
	const { token, pr, changes, images } = opts;
	const { owner, repo } = upstream();
	const headOwner = pr.head_owner;
	const headRepo = pr.head_repo;
	if (!headOwner || !headRepo) throw new Error('The fork this pull request came from was deleted.');

	const headSha = await getLatestCommitSha(token, headOwner, headRepo, pr.head_ref);
	if (headSha !== opts.expectedHeadSha) {
		throw new RevisionConflictError(
			'This pull request changed since you loaded it. Load it again to pick up the new commits.'
		);
	}

	const mainSha = await getLatestCommitSha(token, owner, repo, pr.base_ref);
	const [mainTreeSha, headTreeSha, mergeBase, files] = await Promise.all([
		getCommitTreeSha(token, owner, repo, mainSha),
		getCommitTreeSha(token, owner, repo, headSha),
		getMergeBase(token, owner, repo, mainSha, headSha),
		getPullRequestFiles(token, owner, repo, pr.number)
	]);

	// The editor's entities, written onto main's tree.
	const { treeItems, skippedPaths, noopDeletes } = await buildTreeItems(
		token,
		headOwner,
		headRepo,
		mainTreeSha,
		owner,
		repo,
		changes,
		images
	);

	// Files the PR changed that the editor doesn't model (docs, a stray file in a
	// maintainer's PR) are carried over as they are on the branch, so a push can't revert
	// them. A logo rides along only while its entity is still part of the submission.
	const entityOps = new Map<string, string>(changes.map((c: any) => [c.entity?.path, c.operation]));
	const headTree = await getRecursiveTree(token, owner, repo, headTreeSha);
	const items = new Map<string, TreeItem>();
	const carry = (path: string, removed: boolean) => {
		const entity = repoPathToEntityPath(path);
		if (entity?.isEntityJson) return;
		if (entity) {
			const op = entityOps.get(entity.entityPath);
			if (!op || op === 'delete') return;
		}
		const entry = headTree.get(path);
		if (removed || !entry) items.set(path, { path, sha: null });
		else items.set(path, { path, sha: entry.sha, mode: entry.mode, type: 'blob' });
	};
	for (const f of files) {
		carry(f.filename, f.status === 'removed');
		if (f.previous_filename) carry(f.previous_filename, true);
	}
	for (const item of treeItems) items.set(item.path, item);

	if (items.size === 0) throw new Error(explainEmptyTree(skippedPaths, noopDeletes));

	const treeSha = await createTree(token, headOwner, headRepo, mainTreeSha, [...items.values()]);
	if (treeSha === headTreeSha) {
		return {
			commitSha: null,
			unchanged: true,
			skippedPaths,
			noopDeletes: noopDeletes.map((d) => d.description || d.path)
		};
	}

	// A plain commit when the branch already contains main; otherwise merge main in.
	const parents = mergeBase === mainSha ? [headSha] : [headSha, mainSha];
	const commitSha = await createCommit(token, headOwner, headRepo, opts.message, treeSha, parents);
	await updateRef(token, headOwner, headRepo, pr.head_ref, commitSha);

	return {
		commitSha,
		unchanged: false,
		skippedPaths,
		noopDeletes: noopDeletes.map((d) => d.description || d.path)
	};
}

/** After a push: refresh the `## Changes` list and say on the PR what happened. */
export async function announceRevision(opts: {
	token: string;
	pr: PullRequestDetails;
	access: ReviseAccess;
	changes: any[];
	commitSha: string;
}): Promise<void> {
	const { owner, repo } = upstream();
	const { pr, access } = opts;
	// Only web-editor PRs have a generated `## Changes` list; a maintainer's hand-written
	// PR body is theirs.
	if (access.kind !== 'other') {
		await updatePullRequest(opts.token, owner, repo, pr.number, {
			body: replaceChangesSection(pr.body, opts.changes)
		});
	}
	const who = access.as === 'submitter' ? 'the contributor' : (access.login ?? 'a maintainer');
	await createIssueComment(
		opts.token,
		owner,
		repo,
		pr.number,
		`Updated via the web editor by ${who} (${opts.commitSha.slice(0, 7)}).`
	);
}

// --- Resubmit a returned PR ---

export interface ResubmitResult {
	uuid: string;
	prNumber: number;
	prUrl: string;
	skippedPaths?: string[];
	noopDeletes?: string[];
}

/** Open a new PR for a returned one. Throws with a user-facing message on failure. */
export async function resubmitReturned(opts: {
	cookies: Cookies;
	access: ReviseAccess;
	pr: PullRequestDetails;
	changes: any[];
	images?: Record<string, any>;
	title?: string;
	description?: string;
}): Promise<ResubmitResult> {
	const { access, pr } = opts;
	const uuid = crypto.randomUUID();
	const title = opts.title || pr.title;
	const description = [
		`Resubmission of #${pr.number}, which was returned for changes.`,
		opts.description?.trim()
	]
		.filter(Boolean)
		.join('\n\n');

	if (access.via === 'bot') {
		const result = await createAnonPR({
			uuid,
			changes: opts.changes,
			images: opts.images || {},
			title,
			description
		});
		if (!result.success) throw new Error(result.error || 'Failed to create PR');
		return {
			uuid,
			prNumber: result.prNumber!,
			prUrl: result.prUrl!,
			skippedPaths: result.skippedPaths,
			noopDeletes: result.noopDeletes
		};
	}

	const token = getGitHubToken(opts.cookies);
	if (!token || !access.login) throw new Error('GitHub sign-in expired. Please sign in again.');
	const result = await createForkPR(token, {
		uuid,
		login: access.login,
		changes: opts.changes,
		images: opts.images,
		title,
		description
	});
	if (!result.success) throw new Error(result.error);
	return {
		uuid,
		prNumber: result.prNumber,
		prUrl: result.prUrl,
		skippedPaths: result.skippedPaths,
		noopDeletes: result.noopDeletes
	};
}

// --- The contributor's comments on fields ---

export interface FieldNote {
	entityPath: string;
	pointer: string;
	text: string;
}

/** Keep only well-formed notes, capped, so a request can't post a wall of comments. */
export function sanitizeNotes(raw: unknown): FieldNote[] {
	if (!Array.isArray(raw)) return [];
	return raw
		.filter(
			(n): n is FieldNote =>
				!!n &&
				typeof n.entityPath === 'string' &&
				typeof n.pointer === 'string' &&
				typeof n.text === 'string' &&
				n.text.trim() !== ''
		)
		.slice(0, 50)
		.map((n) => ({
			entityPath: n.entityPath,
			pointer: n.pointer,
			text: n.text.trim().slice(0, 2000)
		}));
}

/** Stop a contributor's text from pinging people. */
function quiet(text: string): string {
	return text.replace(/@(?=[A-Za-z0-9-])/g, '@\u200b');
}

/** "night saphire · name" for a note. */
function noteWhere(note: FieldNote): string {
	const name = note.entityPath.split('/').at(-1)?.replace(/_/g, ' ') ?? note.entityPath;
	const field = labelFromPointer(note.pointer);
	return field ? `${name} · ${field}` : name;
}

/**
 * Post the contributor's comments on the PR, each on the line of the field it is about (at
 * `commitSha`). GitHub refuses a whole review when any line is outside the diff, so when the
 * review fails every comment goes into one ordinary comment instead. Never throws.
 */
export async function postFieldNotes(opts: {
	token: string;
	prNumber: number;
	commitSha: string;
	notes: FieldNote[];
}): Promise<'inline' | 'comment' | 'none'> {
	const { token, prNumber, commitSha, notes } = opts;
	if (notes.length === 0) return 'none';
	const { owner, repo } = upstream();

	const files = new Map<string, Promise<string | null>>();
	const fileAt = (path: string) => {
		if (!files.has(path)) {
			files.set(
				path,
				getFileTextAtRef(token, owner, repo, path, commitSha).catch(() => null)
			);
		}
		return files.get(path)!;
	};

	const comments: { path: string; line: number; body: string }[] = [];
	let allPlaced = true;
	for (const note of notes) {
		let repoPath = entityPathToRepoPath(note.entityPath);
		let pointer = note.pointer;
		if (
			repoPath?.endsWith('/variant.json') &&
			(pointer === '/sizes' || pointer.startsWith('/sizes/'))
		) {
			repoPath = repoPath.replace(/variant\.json$/, 'sizes.json');
			pointer = pointer.slice('/sizes'.length);
		}
		const text = repoPath ? await fileAt(repoPath) : null;
		const path = pointer
			.split('/')
			.slice(1)
			.map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'))
			.map((s) => (/^\d+$/.test(s) ? Number(s) : s));
		const line = text !== null ? lineOfPath(text, path) : null;
		if (!repoPath || line === null) {
			allPlaced = false;
			break;
		}
		comments.push({
			path: repoPath,
			line,
			body: `💬 **From the contributor:**\n\n${quiet(note.text)}`
		});
	}

	if (allPlaced) {
		try {
			await createReview(
				token,
				owner,
				repo,
				prNumber,
				commitSha,
				'Comments from the contributor on their changes.',
				comments
			);
			return 'inline';
		} catch (err) {
			console.warn(
				`[Revise] Inline comments on #${prNumber} refused, posting one comment:`,
				(err as Error).message
			);
		}
	}

	try {
		const lines = notes.map((n) => `- **${noteWhere(n)}**: ${quiet(n.text).replace(/\n+/g, ' ')}`);
		await createIssueComment(
			token,
			owner,
			repo,
			prNumber,
			['💬 **Comments from the contributor:**', '', ...lines].join('\n')
		);
		return 'comment';
	} catch (err) {
		console.warn(
			`[Revise] Could not post the contributor's comments on #${prNumber}:`,
			(err as Error).message
		);
		return 'none';
	}
}
