#!/usr/bin/env node
// Fake GitHub + SimplyPrint + mail outbox for testing the OFD web editor locally.
//
//   node scripts/fake-github/server.js [--port 4010] [--dataset-dir <dist>] [--repo <path>]
//
// Point the web editor at it with GITHUB_API_URL / GITHUB_WEB_URL / SIMPLYPRINT_* /
// EMAIL_OUTBOX_URL (see scripts/fake-github/README.md). All state is in memory; POST
// /__control/reset starts over. Open http://localhost:4010/ for the maintainer UI.
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GitStore } from './git.js';
import { renderIndex, renderPr, renderFile, renderOutbox, renderPicker } from './ui.js';

const args = Object.fromEntries(
	process.argv.slice(2).reduce((acc, a, i, all) => {
		if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1]]);
		return acc;
	}, [])
);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(args.port || process.env.FAKE_GH_PORT || 4010);
const BASE = `http://localhost:${PORT}`;
const REPO_DIR = path.resolve(args.repo || path.join(HERE, '../../..'));
const DATASET_DIR = args['dataset-dir'] ? path.resolve(args['dataset-dir']) : null;
const OWNER = process.env.GITHUB_UPSTREAM_OWNER || 'OpenFilamentCollective';
const REPO = process.env.GITHUB_UPSTREAM_REPO || 'open-filament-database';
const UPSTREAM = `${OWNER}/${REPO}`;
const WEBHOOK_TARGET = process.env.FAKE_GH_WEBHOOK_TARGET || 'http://localhost:5173/api/webhooks/github';
const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || 'fake-webhook-secret';
const APP_SLUG = 'ofd-anon-pr-bot';

// --- Users ---
const GH_USERS = {
	maint: { login: 'maint', name: 'Maya Maintainer', type: 'User', perm: 'write' },
	maint2: { login: 'maint2', name: 'Mo Maintainer', type: 'User', perm: 'admin' },
	'contrib-gh': { login: 'contrib-gh', name: 'Casey Contributor', type: 'User', perm: 'read' },
	outsider: { login: 'outsider', name: 'Otto Outsider', type: 'User', perm: 'read' },
	'github-actions': { login: 'github-actions', name: 'GitHub Actions', type: 'Bot', perm: 'write' },
	'ofd-repo-bot': { login: 'ofd-repo-bot', name: 'OFD repo bot', type: 'Bot', perm: 'write' },
	[APP_SLUG]: { login: APP_SLUG, name: 'OFD anon PR bot', type: 'Bot', perm: 'write' }
};
const SP_USERS = {
	alice: { id: 101, name: 'Alice Anders', email: 'alice@example.test', company: { id: 9001, name: 'Alice Print Farm' } },
	bob: { id: 102, name: 'Bob Berg', email: 'bob@example.test', company: { id: 9002, name: 'Bob Labs' } },
	noemail: { id: 103, name: 'Nina Nomail', email: '', company: null }
};

// --- State ---
let S;
const git = new GitStore(REPO_DIR);
let seedCommit = null;

function freshState() {
	return {
		repos: new Map(), // "owner/name" -> { owner, name, refs: Map('heads/x' -> sha), forkOf }
		tokens: new Map(), // token -> { kind:'user'|'app', login }
		codes: new Map(), // oauth code -> { login | sp }
		spTokens: new Map(),
		pulls: [], // upstream PRs
		nextNumber: 1000,
		nextId: 5_000_000,
		comments: [], // issue comments: {id, pr, user, body, created_at, updated_at}
		reviews: [], // {id, pr, user, body, state, submitted_at, commit_id}
		threads: [], // {id, pr, path, line, original_line, side, resolved, forcedOutdated, commit_id, lineText}
		reviewComments: [], // {id, pr, thread, review, user, body, created_at, in_reply_to, commit_id}
		checks: { failing: [] },
		outbox: { emails: [], ofdWebhooks: [], ghWebhooks: [], log: [] },
		clock: 0
	};
}

function now() {
	// A monotonic clock with 1 s resolution steps, so createdAt comparisons are strict.
	const t = Math.max(Date.now(), S.clock + 1000);
	S.clock = t;
	return new Date(t).toISOString().replace(/\.\d+Z$/, 'Z');
}
const id = () => S.nextId++;

async function reset() {
	S = freshState();
	if (!seedCommit) seedCommit = await git.seedFrom('HEAD');
	S.repos.set(UPSTREAM, { owner: OWNER, name: REPO, refs: new Map([['heads/main', seedCommit]]), forkOf: null });
	log('state reset; main =', seedCommit.slice(0, 7));
}

function log(...a) {
	const line = `${new Date().toISOString().slice(11, 19)} ${a.join(' ')}`;
	console.log('[fake-github]', line);
	S?.outbox.log.push(line);
	if (S && S.outbox.log.length > 500) S.outbox.log.shift();
}

// --- Helpers ---
const userJson = (login) => {
	const u = GH_USERS[login] || { login, type: 'User' };
	const restLogin = u.type === 'Bot' ? `${u.login}[bot]` : u.login;
	return { login: restLogin, id: hashNum(login), type: u.type, avatar_url: `${BASE}/avatars/${login}.png`, html_url: `${BASE}/${login}` };
};
const gqlAuthor = (login) => {
	const u = GH_USERS[login] || { login, type: 'User' };
	return { login: u.login, __typename: u.type };
};
const hashNum = (s) => parseInt(crypto.createHash('md5').update(s).digest('hex').slice(0, 7), 16);
const prUrl = (n) => `${BASE}/${UPSTREAM}/pull/${n}`;

function repoOf(owner, name) {
	return S.repos.get(`${owner}/${name}`) || null;
}

function headSha(pr) {
	const r = S.repos.get(pr.headRepo);
	return r?.refs.get(`heads/${pr.headRef}`) || pr.lastHeadSha;
}

function prRest(pr) {
	const hr = S.repos.get(pr.headRepo);
	const sha = headSha(pr);
	const base = S.repos.get(UPSTREAM).refs.get('heads/main');
	const files = sha ? git.diffTrees(git.getCommit(git.mergeBase(base, sha) || base).tree, git.getCommit(sha).tree) : [];
	return {
		url: `${BASE}/repos/${UPSTREAM}/pulls/${pr.number}`,
		html_url: prUrl(pr.number),
		number: pr.number,
		state: pr.state,
		locked: false,
		title: pr.title,
		body: pr.body,
		user: userJson(pr.user),
		draft: false,
		merged: pr.merged,
		merged_at: pr.merged_at,
		closed_at: pr.closed_at,
		created_at: pr.created_at,
		updated_at: pr.updated_at,
		mergeable: pr.state === 'open' ? true : null,
		mergeable_state: pr.state === 'open' ? 'clean' : 'unknown',
		maintainer_can_modify: pr.maintainer_can_modify,
		changed_files: files.length,
		additions: files.length * 5,
		deletions: files.filter((f) => f.status !== 'added').length * 2,
		head: {
			label: `${hr ? hr.owner : 'unknown'}:${pr.headRef}`,
			ref: pr.headRef,
			sha,
			repo: hr ? { name: hr.name, full_name: `${hr.owner}/${hr.name}`, owner: userJson(hr.owner) } : null
		},
		base: { label: `${OWNER}:main`, ref: 'main', sha: base, repo: { name: REPO, full_name: UPSTREAM, owner: { login: OWNER } } },
		_links: { html: { href: prUrl(pr.number) } }
	};
}

function touch(pr) {
	pr.updated_at = now();
}

// Permission model: user tokens may write to their own repos, to upstream with write
// permission, and to a fork whose open PR allows maintainer edits (with upstream write).
function canWrite(auth, repoKey) {
	if (!auth) return false;
	const repo = S.repos.get(repoKey);
	if (!repo) return false;
	if (auth.kind === 'app') return repoKey === UPSTREAM;
	const u = GH_USERS[auth.login];
	const upstreamWrite = ['write', 'admin', 'maintain'].includes(u?.perm);
	if (repoKey === UPSTREAM) return upstreamWrite;
	if (repo.owner === auth.login) return true;
	return (
		upstreamWrite &&
		S.pulls.some((p) => p.headRepo === repoKey && p.state === 'open' && p.maintainer_can_modify)
	);
}

// --- Threads ---
function fileLines(commitSha, p) {
	const c = git.getCommit(commitSha);
	const e = c && git.getTree(c.tree).flat.get(p);
	return e ? git.getBlob(e.sha).toString('utf8').split('\n') : null;
}

function threadOutdated(t) {
	if (t.forcedOutdated) return true;
	if (t.line == null) return false;
	const pr = S.pulls.find((p) => p.number === t.pr);
	const sha = headSha(pr);
	if (!sha || sha === t.commit_id) return false;
	const lines = fileLines(sha, t.path);
	return !lines || lines[t.line - 1] !== t.lineText;
}

/** Lines of the head file that are part of the diff (GitHub only accepts comments there). */
function diffLines(pr, p) {
	const sha = headSha(pr);
	const mainSha = S.repos.get(UPSTREAM).refs.get('heads/main');
	const mb = git.mergeBase(mainSha, sha);
	const head = fileLines(sha, p);
	if (!head) return null;
	const base = fileLines(mb, p);
	if (!base) return new Set(head.map((_, i) => i + 1));
	let pre = 0;
	while (pre < head.length && pre < base.length && head[pre] === base[pre]) pre++;
	let suf = 0;
	while (suf < head.length - pre && suf < base.length - pre && head[head.length - 1 - suf] === base[base.length - 1 - suf]) suf++;
	const set = new Set();
	const from = Math.max(1, pre + 1 - 3);
	const to = Math.min(head.length, head.length - suf + 3);
	for (let i = from; i <= to; i++) set.add(i);
	return set;
}

function addReview(pr, login, { body = '', event = 'COMMENT', comments = [], commit_id } = {}) {
	const state = { COMMENT: 'COMMENTED', REQUEST_CHANGES: 'CHANGES_REQUESTED', APPROVE: 'APPROVED' }[event] || 'COMMENTED';
	const review = { id: id(), pr: pr.number, user: login, body, state, submitted_at: now(), commit_id: commit_id || headSha(pr) };
	S.reviews.push(review);
	for (const c of comments) addThread(pr, login, { ...c, review: review.id });
	touch(pr);
	return review;
}

function addThread(pr, login, { path: p, line = null, body, review = null, side = 'RIGHT' }) {
	const commit_id = headSha(pr);
	const lines = line != null ? fileLines(commit_id, p) : null;
	const t = {
		id: id(),
		pr: pr.number,
		path: p,
		line,
		original_line: line,
		side,
		resolved: false,
		forcedOutdated: false,
		commit_id,
		lineText: lines ? lines[line - 1] : null
	};
	S.threads.push(t);
	if (review == null) review = addReview(pr, login, { body: '' }).id;
	S.reviewComments.push({ id: id(), pr: pr.number, thread: t.id, review, user: login, body, created_at: now(), in_reply_to: null, commit_id });
	touch(pr);
	return t;
}

function addReply(pr, login, threadId, body) {
	const t = S.threads.find((x) => x.id === threadId);
	if (!t) throw httpError(404, 'thread not found');
	const first = S.reviewComments.find((c) => c.thread === t.id);
	const review = addReview(pr, login, { body: '' });
	const c = { id: id(), pr: pr.number, thread: t.id, review: review.id, user: login, body, created_at: now(), in_reply_to: first.id, commit_id: headSha(pr) };
	S.reviewComments.push(c);
	touch(pr);
	return c;
}

function addComment(pr, login, body) {
	const c = { id: id(), pr: pr.number, user: login, body, created_at: now(), updated_at: null };
	c.updated_at = c.created_at;
	S.comments.push(c);
	touch(pr);
	return c;
}

const commentRest = (c) => ({
	id: c.id,
	body: c.body,
	user: userJson(c.user),
	created_at: c.created_at,
	updated_at: c.updated_at,
	html_url: `${prUrl(c.pr)}#issuecomment-${c.id}`
});

// --- Outgoing GitHub webhooks ---
async function fireWebhook(event, payload) {
	const body = JSON.stringify(payload);
	const sig = 'sha256=' + crypto.createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');
	const entry = { at: now(), event, action: payload.action, pr: payload.pull_request?.number, status: null, response: null };
	S.outbox.ghWebhooks.push(entry);
	try {
		const res = await fetch(WEBHOOK_TARGET, {
			method: 'POST',
			headers: { 'content-type': 'application/json', 'x-github-event': event, 'x-hub-signature-256': sig, 'x-github-delivery': crypto.randomUUID() },
			body
		});
		entry.status = res.status;
		entry.response = (await res.text()).slice(0, 300);
	} catch (e) {
		entry.status = 'error';
		entry.response = String(e.message || e);
	}
	log(`webhook ${event}.${payload.action} #${entry.pr} -> ${entry.status} ${entry.response}`);
}

function prEvent(pr, action, sender) {
	return fireWebhook('pull_request', { action, number: pr.number, pull_request: prRest(pr), sender: userJson(sender), repository: { full_name: UPSTREAM } });
}

function reviewEvent(pr, review) {
	return fireWebhook('pull_request_review', {
		action: 'submitted',
		review: { id: review.id, state: review.state.toLowerCase(), body: review.body, user: userJson(review.user), html_url: `${prUrl(pr.number)}#pullrequestreview-${review.id}` },
		pull_request: prRest(pr),
		sender: userJson(review.user),
		repository: { full_name: UPSTREAM }
	});
}

// --- PR lifecycle actions (used by REST and control) ---
async function closePr(pr, login, { comment } = {}) {
	if (comment) addComment(pr, login, comment);
	if (pr.state === 'closed') throw httpError(422, 'already closed');
	pr.state = 'closed';
	pr.closed_at = now();
	pr.lastHeadSha = headSha(pr);
	touch(pr);
	log(`#${pr.number} closed by ${login}`);
	await prEvent(pr, 'closed', login);
}

async function reopenPr(pr, login) {
	if (pr.merged) throw httpError(422, 'merged PRs cannot be reopened');
	const hr = S.repos.get(pr.headRepo);
	if (!hr || !hr.refs.has(`heads/${pr.headRef}`)) throw httpError(422, 'head branch was deleted; cannot reopen');
	pr.state = 'open';
	pr.closed_at = null;
	touch(pr);
	log(`#${pr.number} reopened by ${login}`);
	await prEvent(pr, 'reopened', login);
}

async function mergePr(pr, login, expectSha) {
	if (pr.state !== 'open') throw httpError(405, 'Pull Request is not mergeable');
	const sha = headSha(pr);
	if (expectSha && expectSha !== sha) throw httpError(409, 'Head branch was modified. Review and try the merge again.');
	const up = S.repos.get(UPSTREAM);
	const main = up.refs.get('heads/main');
	const mb = git.mergeBase(main, sha);
	// 3-way flat merge: apply the PR's changes on top of main.
	const baseFlat = git.getTree(git.getCommit(mb).tree).flat;
	const headFlat = git.getTree(git.getCommit(sha).tree).flat;
	const out = new Map(git.getTree(git.getCommit(main).tree).flat);
	for (const [p, e] of headFlat) if (baseFlat.get(p)?.sha !== e.sha) out.set(p, e);
	for (const p of baseFlat.keys()) if (!headFlat.has(p)) out.delete(p);
	const tree = git.putTree(out);
	const commit = git.putCommit({ tree, parents: [main, sha], message: `Merge pull request #${pr.number}`, author: { name: login, email: `${login}@fake.test` }, date: now() });
	up.refs.set('heads/main', commit);
	pr.state = 'closed';
	pr.merged = true;
	pr.merged_at = pr.closed_at = now();
	pr.lastHeadSha = sha;
	touch(pr);
	log(`#${pr.number} merged by ${login}`);
	await prEvent(pr, 'closed', login);
	return commit;
}

/** Commit file changes directly to a branch of a repo (control: simulate other merges). */
function commitFiles(repoKey, branch, files, message, login = 'maint') {
	const repo = S.repos.get(repoKey);
	const parent = repo.refs.get(`heads/${branch}`);
	const flat = new Map(git.getTree(git.getCommit(parent).tree).flat);
	for (const [p, content] of Object.entries(files)) {
		if (content === null) flat.delete(p);
		else flat.set(p, { mode: '100644', sha: git.putBlob(content) });
	}
	const tree = git.putTree(flat);
	const sha = git.putCommit({ tree, parents: [parent], message, author: { name: login, email: `${login}@fake.test` }, date: now() });
	repo.refs.set(`heads/${branch}`, sha);
	log(`commit ${sha.slice(0, 7)} on ${repoKey}:${branch} (${Object.keys(files).length} files)`);
	return sha;
}

// --- GraphQL ---
function gqlPullRequest(pr) {
	const hr = S.repos.get(pr.headRepo);
	const comments = S.comments.filter((c) => c.pr === pr.number);
	const reviews = S.reviews.filter((r) => r.pr === pr.number);
	const threads = S.threads.filter((t) => t.pr === pr.number);
	const gc = (c) => ({ databaseId: c.id, body: c.body, url: `${prUrl(pr.number)}#issuecomment-${c.id}`, createdAt: c.created_at, author: gqlAuthor(c.user) });
	return {
		number: pr.number,
		title: pr.title,
		url: prUrl(pr.number),
		state: pr.merged ? 'MERGED' : pr.state === 'open' ? 'OPEN' : 'CLOSED',
		merged: pr.merged,
		updatedAt: pr.updated_at,
		closedAt: pr.closed_at,
		body: pr.body,
		author: gqlAuthor(pr.user),
		headRefName: pr.headRef,
		headRefOid: headSha(pr),
		headRepository: hr ? { name: hr.name, owner: { login: hr.owner } } : null,
		maintainerCanModify: pr.maintainer_can_modify,
		comments: { totalCount: comments.length, nodes: comments.slice(0, 100).map(gc) },
		reviews: {
			totalCount: reviews.length,
			nodes: reviews.slice(0, 100).map((r) => ({
				databaseId: r.id,
				body: r.body,
				url: `${prUrl(pr.number)}#pullrequestreview-${r.id}`,
				createdAt: r.submitted_at,
				state: r.state,
				submittedAt: r.submitted_at,
				author: gqlAuthor(r.user)
			}))
		},
		reviewThreads: {
			totalCount: threads.length,
			nodes: threads.slice(0, 100).map((t) => {
				const outdated = threadOutdated(t);
				return {
					isResolved: t.resolved,
					isOutdated: outdated,
					path: t.path,
					line: outdated ? null : t.line,
					originalLine: t.original_line,
					diffSide: t.side,
					comments: {
						nodes: S.reviewComments
							.filter((c) => c.thread === t.id)
							.slice(0, 50)
							.map((c) => ({
								databaseId: c.id,
								body: c.body,
								url: `${prUrl(pr.number)}#discussion_r${c.id}`,
								createdAt: c.created_at,
								author: gqlAuthor(c.user),
								pullRequestReview: c.review ? { databaseId: c.review } : null,
								replyTo: c.in_reply_to ? { databaseId: c.in_reply_to } : null,
								commit: { oid: headSha(pr) },
								originalCommit: { oid: c.commit_id }
							}))
					}
				};
			})
		}
	};
}

function graphql(auth, { query, variables = {} }) {
	if (!auth) return [401, { message: 'This endpoint requires you to be authenticated.' }];
	if (/pullRequest\s*\(/.test(query)) {
		const pr = S.pulls.find((p) => p.number === Number(variables.number));
		if (`${variables.owner}/${variables.repo}` !== UPSTREAM || !pr) {
			return [200, { data: { repository: pr ? null : { pullRequest: null } }, errors: [{ type: 'NOT_FOUND', message: `Could not resolve to a PullRequest with the number of ${variables.number}.` }] }];
		}
		return [200, { data: { repository: { pullRequest: gqlPullRequest(pr) } } }];
	}
	log('UNHANDLED GraphQL query:', query.slice(0, 200));
	return [200, { errors: [{ message: 'fake-github: unsupported query' }] }];
}

// --- HTTP plumbing ---
class HttpError extends Error {
	constructor(status, message, extra) {
		super(message);
		this.status = status;
		this.extra = extra;
	}
}
const httpError = (s, m, extra) => new HttpError(s, m, extra);

function send(res, status, body, headers = {}) {
	const isStr = typeof body === 'string' || Buffer.isBuffer(body);
	res.writeHead(status, {
		'content-type': isStr ? 'text/html; charset=utf-8' : 'application/json',
		'access-control-allow-origin': '*',
		...headers
	});
	res.end(isStr ? body : JSON.stringify(body));
}

async function readBody(req) {
	const chunks = [];
	for await (const c of req) chunks.push(c);
	const raw = Buffer.concat(chunks).toString('utf8');
	const ct = req.headers['content-type'] || '';
	if (!raw) return {};
	if (ct.includes('application/json')) return JSON.parse(raw);
	if (ct.includes('x-www-form-urlencoded')) return Object.fromEntries(new URLSearchParams(raw));
	try {
		return JSON.parse(raw);
	} catch {
		return { raw };
	}
}

function authOf(req) {
	const h = req.headers.authorization || '';
	const m = /^(?:Bearer|token)\s+(.+)$/i.exec(h);
	if (!m) return null;
	const tok = m[1].trim();
	if (S.tokens.has(tok)) return S.tokens.get(tok);
	if (tok.split('.').length === 3) return { kind: 'jwt' };
	return { kind: 'invalid' };
}

// --- Router ---
const routes = [];
const on = (method, pattern, fn) => {
	const keys = [];
	const re = new RegExp('^' + pattern.replace(/:(\w+)\*?/g, (m, k) => (keys.push(k), m.endsWith('*') ? '(.+)' : '([^/]+)')) + '$');
	routes.push({ method, re, keys, fn });
};

function needUser(auth) {
	if (!auth || auth.kind === 'invalid') throw httpError(401, 'Bad credentials');
	return auth;
}
function needRepo(o, r) {
	const repo = repoOf(o, r);
	if (!repo) throw httpError(404, 'Not Found');
	return repo;
}
function needWrite(auth, o, r) {
	needUser(auth);
	needRepo(o, r);
	if (!canWrite(auth, `${o}/${r}`)) throw httpError(auth.kind === 'app' ? 403 : 404, auth.kind === 'app' ? 'Resource not accessible by integration' : 'Not Found');
}
function needPr(n) {
	const pr = S.pulls.find((p) => p.number === Number(n));
	if (!pr) throw httpError(404, 'Not Found');
	return pr;
}
const actorOf = (auth) => (auth.kind === 'app' ? APP_SLUG : auth.login);

// GitHub App
on('POST', '/app/installations/:id/access_tokens', (req, p, auth) => {
	if (!auth || auth.kind !== 'jwt') throw httpError(401, 'A JSON web token could not be decoded');
	const token = `ghs_fake_${crypto.randomBytes(8).toString('hex')}`;
	S.tokens.set(token, { kind: 'app', login: APP_SLUG });
	return [201, { token, expires_at: new Date(Date.now() + 3600_000).toISOString() }];
});

on('GET', '/user', (req, p, auth) => {
	needUser(auth);
	if (auth.kind !== 'user') throw httpError(403, 'Resource not accessible by integration');
	const u = GH_USERS[auth.login];
	return [200, { ...userJson(auth.login), name: u.name }];
});

on('POST', '/graphql', (req, p, auth, body) => graphql(auth && auth.kind !== 'invalid' ? auth : null, body));

on('GET', '/repos/:o/:r', (req, { o, r }) => {
	const repo = needRepo(o, r);
	return [200, { name: repo.name, full_name: `${o}/${r}`, owner: userJson(o), default_branch: 'main', fork: !!repo.forkOf }];
});

on('POST', '/repos/:o/:r/forks', (req, { o, r }, auth) => {
	needUser(auth);
	needRepo(o, r);
	const key = `${auth.login}/${r}`;
	if (!S.repos.has(key)) {
		const up = S.repos.get(`${o}/${r}`);
		S.repos.set(key, { owner: auth.login, name: r, refs: new Map([['heads/main', up.refs.get('heads/main')]]), forkOf: `${o}/${r}` });
		log(`fork created ${key}`);
	}
	return [202, { name: r, full_name: key, owner: userJson(auth.login) }];
});

on('POST', '/repos/:o/:r/merge-upstream', (req, { o, r }, auth) => {
	needWrite(auth, o, r);
	return [200, { message: 'fake: not implemented, no-op', merge_type: 'none' }];
});

on('GET', '/repos/:o/:r/git/ref/:ref*', (req, { o, r, ref }) => {
	const repo = needRepo(o, r);
	const sha = repo.refs.get(ref);
	if (!sha) throw httpError(404, 'Not Found');
	return [200, { ref: `refs/${ref}`, object: { sha, type: 'commit' } }];
});

on('POST', '/repos/:o/:r/git/refs', (req, { o, r }, auth, body) => {
	needWrite(auth, o, r);
	const repo = repoOf(o, r);
	const ref = String(body.ref || '').replace(/^refs\//, '');
	if (!ref.startsWith('heads/')) throw httpError(422, 'Reference name must start with refs/heads/');
	if (!git.getCommit(body.sha)) throw httpError(422, 'Object does not exist');
	if (repo.refs.has(ref)) throw httpError(422, 'Reference already exists');
	repo.refs.set(ref, body.sha);
	log(`ref created ${o}/${r}:${ref} -> ${body.sha.slice(0, 7)}`);
	return [201, { ref: `refs/${ref}`, object: { sha: body.sha, type: 'commit' } }];
});

on('PATCH', '/repos/:o/:r/git/refs/:ref*', (req, { o, r, ref }, auth, body) => {
	needWrite(auth, o, r);
	const repo = repoOf(o, r);
	const cur = repo.refs.get(ref);
	if (!cur) throw httpError(422, 'Reference does not exist');
	if (!git.getCommit(body.sha)) throw httpError(422, 'Object does not exist');
	if (!body.force && !git.ancestors(body.sha).has(cur)) throw httpError(422, 'Update is not a fast forward');
	repo.refs.set(ref, body.sha);
	log(`ref updated ${o}/${r}:${ref} -> ${body.sha.slice(0, 7)}`);
	for (const pr of S.pulls) if (pr.headRepo === `${o}/${r}` && `heads/${pr.headRef}` === ref && pr.state === 'open') touch(pr);
	return [200, { ref: `refs/${ref}`, object: { sha: body.sha, type: 'commit' } }];
});

on('DELETE', '/repos/:o/:r/git/refs/:ref*', (req, { o, r, ref }, auth) => {
	needWrite(auth, o, r);
	const repo = repoOf(o, r);
	if (!repo.refs.has(ref)) throw httpError(422, 'Reference does not exist');
	for (const pr of S.pulls) if (pr.headRepo === `${o}/${r}` && `heads/${pr.headRef}` === ref) pr.lastHeadSha = headSha(pr);
	repo.refs.delete(ref);
	log(`ref deleted ${o}/${r}:${ref}`);
	return [204, ''];
});

on('POST', '/repos/:o/:r/git/blobs', (req, { o, r }, auth, body) => {
	needWrite(auth, o, r);
	const buf = body.encoding === 'base64' ? Buffer.from(body.content, 'base64') : Buffer.from(body.content ?? '', 'utf8');
	const sha = git.putBlob(buf);
	return [201, { sha, url: `${BASE}/repos/${o}/${r}/git/blobs/${sha}` }];
});

on('GET', '/repos/:o/:r/git/blobs/:sha', (req, { o, r, sha }) => {
	needRepo(o, r);
	const buf = git.hasBlob(sha) ? git.getBlob(sha) : null;
	if (!buf) throw httpError(404, 'Not Found');
	return [200, { sha, size: buf.length, encoding: 'base64', content: buf.toString('base64').replace(/(.{60})/g, '$1\n') }];
});

on('GET', '/repos/:o/:r/git/trees/:sha', (req, { o, r, sha }, auth, body, url) => {
	needRepo(o, r);
	let t = git.getTree(sha);
	if (!t && git.getCommit(sha)) t = git.getTree(git.getCommit(sha).tree);
	if (!t) throw httpError(404, 'Not Found');
	if (url.searchParams.get('recursive') == null) throw httpError(501, 'fake-github: only recursive tree reads are implemented');
	const tree = [];
	for (const [dir, dsha] of t.subtrees) tree.push({ path: dir, mode: '040000', type: 'tree', sha: dsha });
	for (const [p, e] of t.flat) tree.push({ path: p, mode: e.mode, type: 'blob', sha: e.sha });
	tree.sort((a, b) => (a.path < b.path ? -1 : 1));
	return [200, { sha, tree, truncated: false }];
});

on('POST', '/repos/:o/:r/git/trees', (req, { o, r }, auth, body) => {
	needWrite(auth, o, r);
	let flat = new Map();
	if (body.base_tree) {
		const base = git.getTree(body.base_tree);
		if (!base) throw httpError(422, 'base_tree is not a valid tree oid');
		flat = new Map(base.flat);
	}
	for (const e of body.tree || []) {
		if (e.type && e.type !== 'blob') throw httpError(422, 'fake-github: only blob entries supported');
		if (e.sha === null) {
			flat.delete(e.path);
			continue;
		}
		let sha = e.sha;
		if (sha === undefined && e.content !== undefined) sha = git.putBlob(e.content);
		if (!git.hasBlob(sha)) throw httpError(422, `tree.sha ${sha} is not a valid blob`);
		flat.set(e.path, { mode: e.mode || '100644', sha });
	}
	const sha = git.putTree(flat);
	return [201, { sha, truncated: false }];
});

on('POST', '/repos/:o/:r/git/commits', (req, { o, r }, auth, body) => {
	needWrite(auth, o, r);
	if (!git.getTree(body.tree)) throw httpError(422, 'Tree SHA does not exist');
	for (const p of body.parents || []) if (!git.getCommit(p)) throw httpError(422, 'Parent SHA does not exist or is not a commit object');
	const login = actorOf(auth);
	const sha = git.putCommit({ tree: body.tree, parents: body.parents || [], message: body.message, author: { name: login, email: `${login}@fake.test` }, date: now() });
	return [201, { sha, tree: { sha: body.tree }, parents: (body.parents || []).map((s) => ({ sha: s })), message: body.message }];
});

on('GET', '/repos/:o/:r/git/commits/:sha', (req, { o, r, sha }) => {
	needRepo(o, r);
	const c = git.getCommit(sha);
	if (!c) throw httpError(404, 'Not Found');
	return [200, { sha, tree: { sha: c.tree }, parents: c.parents.map((s) => ({ sha: s })), message: c.message, author: { name: c.author.name, date: c.date } }];
});

on('GET', '/repos/:o/:r/compare/:spec*', (req, { o, r, spec }) => {
	needRepo(o, r);
	const [baseSpec, headSpec] = decodeURIComponent(spec).split('...');
	const resolve = (s) => {
		if (git.getCommit(s)) return s;
		const [own, br] = s.includes(':') ? s.split(':') : [o, s];
		return S.repos.get(`${own}/${r}`)?.refs.get(`heads/${br}`) || null;
	};
	const b = resolve(baseSpec);
	const h = resolve(headSpec);
	if (!b || !h) throw httpError(404, 'Not Found');
	const mb = git.mergeBase(b, h);
	return [200, { merge_base_commit: { sha: mb }, base_commit: { sha: b }, status: mb === b ? 'ahead' : 'diverged', files: git.diffTrees(git.getCommit(mb).tree, git.getCommit(h).tree).slice(0, 1) }];
});

on('GET', '/repos/:o/:r/contents/:p*', (req, { o, r, p }, auth, body, url) => {
	const repo = needRepo(o, r);
	const ref = url.searchParams.get('ref') || 'main';
	const sha = git.getCommit(ref) ? ref : repo.refs.get(`heads/${ref}`);
	if (!sha) throw httpError(404, 'No commit found for the ref');
	const filePath = decodeURIComponent(p);
	const e = git.getTree(git.getCommit(sha).tree).flat.get(filePath);
	if (!e) throw httpError(404, 'Not Found');
	const buf = git.getBlob(e.sha);
	return [200, { type: 'file', path: filePath, name: path.basename(filePath), sha: e.sha, size: buf.length, encoding: 'base64', content: buf.toString('base64') }];
});

on('GET', '/repos/:o/:r/collaborators/:user/permission', (req, { o, r, user }, auth) => {
	needUser(auth);
	needRepo(o, r);
	const u = GH_USERS[user];
	if (!u) throw httpError(404, 'Not Found');
	return [200, { permission: u.perm === 'maintain' ? 'write' : u.perm, role_name: u.perm, user: userJson(user) }];
});

on('GET', '/repos/:o/:r/commits/:sha/check-runs', (req, { sha }) => [
	200,
	{ total_count: 1, check_runs: [{ name: 'Validate data', status: 'completed', conclusion: S.checks.failing.includes('Validate data') ? 'failure' : 'success', head_sha: sha }] }
]);

on('GET', '/repos/:o/:r/commits/:sha/status', (req, { sha }) => {
	const contexts = ['Brand sign-off', 'Sustainability sources'];
	const statuses = contexts.map((c) => ({ context: c, state: S.checks.failing.includes(c) ? 'failure' : 'success', description: 'fake', target_url: null }));
	return [200, { state: statuses.every((s) => s.state === 'success') ? 'success' : 'failure', sha, statuses }];
});

// Pulls
on('POST', '/repos/:o/:r/pulls', async (req, { o, r }, auth, body) => {
	needUser(auth);
	needRepo(o, r);
	const login = actorOf(auth);
	const [headOwner, headRef] = body.head.includes(':') ? body.head.split(':') : [o, body.head];
	const headRepo = `${headOwner}/${r}`;
	const hr = S.repos.get(headRepo);
	const sha = hr?.refs.get(`heads/${headRef}`);
	if (!sha) throw httpError(422, 'Validation Failed', [{ resource: 'PullRequest', field: 'head', code: 'invalid' }]);
	if (S.pulls.some((p) => p.headRepo === headRepo && p.headRef === headRef && p.state === 'open'))
		throw httpError(422, 'Validation Failed', [{ resource: 'PullRequest', code: 'custom', message: `A pull request already exists for ${headOwner}:${headRef}.` }]);
	const main = S.repos.get(UPSTREAM).refs.get('heads/main');
	if (git.ancestors(main).has(sha)) throw httpError(422, 'Validation Failed', [{ resource: 'PullRequest', code: 'custom', message: `No commits between main and ${headRef}` }]);
	const t = now();
	const pr = {
		number: S.nextNumber++,
		title: body.title,
		body: body.body || '',
		user: login,
		headRepo,
		headRef,
		state: 'open',
		merged: false,
		merged_at: null,
		closed_at: null,
		created_at: t,
		updated_at: t,
		maintainer_can_modify: headRepo !== UPSTREAM && body.maintainer_can_modify !== false,
		lastHeadSha: null
	};
	S.pulls.push(pr);
	log(`#${pr.number} opened by ${login} from ${headRepo}:${headRef}`);
	prEvent(pr, 'opened', login);
	return [201, prRest(pr)];
});

on('GET', '/repos/:o/:r/pulls', (req, { o, r }, auth, body, url) => {
	needRepo(o, r);
	const state = url.searchParams.get('state') || 'open';
	const per = Math.min(Number(url.searchParams.get('per_page') || 30), 100);
	const page = Number(url.searchParams.get('page') || 1);
	const list = S.pulls
		.filter((p) => state === 'all' || p.state === state)
		.sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))
		.slice((page - 1) * per, page * per);
	return [200, list.map(prRest)];
});

on('GET', '/repos/:o/:r/pulls/:n', (req, { o, r, n }) => {
	needRepo(o, r);
	return [200, prRest(needPr(n))];
});

on('PATCH', '/repos/:o/:r/pulls/:n', async (req, { o, r, n }, auth, body) => {
	needUser(auth);
	const pr = needPr(n);
	const login = actorOf(auth);
	if (login !== pr.user && !canWrite(auth, UPSTREAM)) throw httpError(403, 'Must have admin rights to Repository.');
	if (body.title !== undefined) pr.title = body.title;
	if (body.body !== undefined) pr.body = body.body;
	if (body.maintainer_can_modify !== undefined) pr.maintainer_can_modify = !!body.maintainer_can_modify;
	touch(pr);
	if (body.state === 'closed' && pr.state === 'open') await closePr(pr, login);
	if (body.state === 'open' && pr.state === 'closed') await reopenPr(pr, login);
	return [200, prRest(pr)];
});

on('GET', '/repos/:o/:r/pulls/:n/files', (req, { o, r, n }, auth, body, url) => {
	const pr = needPr(n);
	const sha = headSha(pr);
	const main = S.repos.get(UPSTREAM).refs.get('heads/main');
	const mb = git.mergeBase(main, sha);
	const files = git.diffTrees(git.getCommit(mb).tree, git.getCommit(sha).tree);
	const per = Math.min(Number(url.searchParams.get('per_page') || 30), 100);
	const page = Number(url.searchParams.get('page') || 1);
	return [200, files.slice((page - 1) * per, page * per).map((f) => ({ ...f, additions: 1, deletions: 0, changes: 1 }))];
});

on('PUT', '/repos/:o/:r/pulls/:n/merge', async (req, { o, r, n }, auth, body) => {
	needUser(auth);
	if (!canWrite(auth, UPSTREAM)) throw httpError(403, 'Resource not accessible');
	const pr = needPr(n);
	const sha = await mergePr(pr, actorOf(auth), body.sha);
	return [200, { sha, merged: true, message: 'Pull Request successfully merged' }];
});

on('POST', '/repos/:o/:r/pulls/:n/reviews', async (req, { o, r, n }, auth, body) => {
	needUser(auth);
	const pr = needPr(n);
	const login = actorOf(auth);
	for (const c of body.comments || []) {
		const lines = diffLines(pr, c.path);
		if (!lines || (c.line != null && !lines.has(Number(c.line))))
			throw httpError(422, 'Unprocessable Entity', ['Line could not be resolved', `pull_request_review_thread.line must be part of the diff (${c.path}:${c.line})`]);
	}
	const event = body.event || 'COMMENT';
	if (login === pr.user && event !== 'COMMENT') throw httpError(422, 'Can not request changes on your own pull request');
	const review = addReview(pr, login, { body: body.body || '', event, comments: (body.comments || []).map((c) => ({ path: c.path, line: c.line ?? null, body: c.body, side: c.side })), commit_id: body.commit_id });
	reviewEvent(pr, review);
	return [200, { id: review.id, state: review.state, body: review.body, user: userJson(login) }];
});

// Issue comments
on('GET', '/repos/:o/:r/issues/:n/comments', (req, { n }, auth, body, url) => {
	needPr(n);
	const per = Math.min(Number(url.searchParams.get('per_page') || 30), 100);
	const page = Number(url.searchParams.get('page') || 1);
	return [200, S.comments.filter((c) => c.pr === Number(n)).slice((page - 1) * per, page * per).map(commentRest)];
});

on('POST', '/repos/:o/:r/issues/:n/comments', (req, { n }, auth, body) => {
	needUser(auth);
	const pr = needPr(n);
	const c = addComment(pr, actorOf(auth), body.body);
	log(`#${pr.number} comment by ${actorOf(auth)}: ${body.body.slice(0, 80).replace(/\n/g, ' ')}`);
	return [201, commentRest(c)];
});

on('PATCH', '/repos/:o/:r/issues/comments/:cid', (req, { cid }, auth, body) => {
	needUser(auth);
	const c = S.comments.find((x) => x.id === Number(cid));
	if (!c) throw httpError(404, 'Not Found');
	if (c.user !== actorOf(auth) && !canWrite(auth, UPSTREAM)) throw httpError(403, 'Forbidden');
	c.body = body.body;
	c.updated_at = now();
	log(`#${c.pr} comment ${c.id} edited by ${actorOf(auth)}`);
	return [200, commentRest(c)];
});

// --- GitHub OAuth ---
on('GET', '/login/oauth/authorize', (req, p, auth, body, url) => {
	const users = Object.values(GH_USERS).filter((u) => u.type === 'User');
	return [200, renderPicker('GitHub', url, users.map((u) => ({ key: u.login, label: `${u.login} — ${u.name} (${u.perm})` })), '/login/oauth/authorize/approve')];
});
on('GET', '/login/oauth/authorize/approve', (req, p, auth, body, url) => {
	const code = crypto.randomBytes(10).toString('hex');
	S.codes.set(code, { gh: url.searchParams.get('as') });
	const to = new URL(url.searchParams.get('redirect_uri'));
	to.searchParams.set('code', code);
	to.searchParams.set('state', url.searchParams.get('state'));
	return [302, '', { location: to.toString() }];
});
on('POST', '/login/oauth/access_token', (req, p, auth, body) => {
	const entry = S.codes.get(body.code);
	if (!entry?.gh) return [200, { error: 'bad_verification_code', error_description: 'The code passed is incorrect or expired.' }];
	S.codes.delete(body.code);
	const token = `gho_${entry.gh}_${crypto.randomBytes(6).toString('hex')}`;
	S.tokens.set(token, { kind: 'user', login: entry.gh });
	log(`github oauth: ${entry.gh} signed in`);
	return [200, { access_token: token, token_type: 'bearer', scope: 'public_repo,workflow' }];
});

// --- SimplyPrint ---
on('GET', '/panel/oauth2/authorize', (req, p, auth, body, url) => [
	200,
	renderPicker('SimplyPrint', url, Object.entries(SP_USERS).map(([k, u]) => ({ key: k, label: `${u.name} <${u.email || 'no email'}>` })), '/panel/oauth2/authorize/approve')
]);
on('GET', '/panel/oauth2/authorize/approve', (req, p, auth, body, url) => {
	const code = crypto.randomBytes(10).toString('hex');
	S.codes.set(code, { sp: url.searchParams.get('as'), challenge: url.searchParams.get('code_challenge') });
	const to = new URL(url.searchParams.get('redirect_uri'));
	to.searchParams.set('code', code);
	to.searchParams.set('state', url.searchParams.get('state'));
	return [302, '', { location: to.toString() }];
});
on('POST', '/api/oauth2/Token', (req, p, auth, body) => {
	const entry = S.codes.get(body.code);
	if (!entry?.sp) return [400, { error: 'invalid_grant' }];
	if (entry.challenge) {
		const calc = crypto.createHash('sha256').update(body.code_verifier || '').digest('base64url');
		if (calc !== entry.challenge) return [400, { error: 'invalid_grant', error_description: 'PKCE verification failed' }];
	}
	S.codes.delete(body.code);
	const token = `sp_${entry.sp}_${crypto.randomBytes(6).toString('hex')}`;
	S.spTokens.set(token, entry.sp);
	log(`simplyprint oauth: ${entry.sp} signed in`);
	return [200, { access_token: token, refresh_token: `r_${token}`, token_type: 'Bearer', expires_in: 3600 }];
});
on('GET', '/api/oauth2/TokenInfo', (req) => {
	const tok = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
	const key = S.spTokens.get(tok);
	if (!key) return [401, { status: false, message: 'invalid token' }];
	const u = SP_USERS[key];
	return [200, { status: true, user: { id: u.id, name: u.name, email: u.email }, company: u.company }];
});
on('GET', '/api/users/profilepicture/GetUserProfilePicture', () => [404, { status: false }]);

// --- Outbox (emails + OFD outgoing webhooks) ---
on('POST', '/__outbox/email', (req, p, auth, body) => {
	S.outbox.emails.push({ at: now(), ...body });
	log(`EMAIL to ${body.to}: ${body.subject}`);
	return [200, { ok: true }];
});
on('POST', '/__outbox/webhook/:event', (req, { event }, auth, body) => {
	S.outbox.ofdWebhooks.push({ at: now(), event, signature: req.headers['x-ofd-signature'], body });
	log(`OFD webhook ${event}: ${JSON.stringify(body).slice(0, 200)}`);
	return [200, { ok: true }];
});

// --- Control API (maintainer actions; `as` picks the GitHub user) ---
const ctl = (method, p, fn) => on(method, `/__control${p}`, fn);
ctl('POST', '/reset', async () => (await reset(), [200, { ok: true }]));
ctl('GET', '/state', () => [200, { main: S.repos.get(UPSTREAM).refs.get('heads/main'), repos: [...S.repos.values()].map((r) => ({ key: `${r.owner}/${r.name}`, refs: Object.fromEntries(r.refs) })), pulls: S.pulls.map(prRest), comments: S.comments, reviews: S.reviews, threads: S.threads.map((t) => ({ ...t, outdated: threadOutdated(t) })), reviewComments: S.reviewComments }]);
ctl('GET', '/outbox', () => [200, S.outbox]);
ctl('POST', '/outbox/clear', () => ((S.outbox = { emails: [], ofdWebhooks: [], ghWebhooks: [], log: [] }), [200, { ok: true }]));
ctl('POST', '/pr/:n/comment', (req, { n }, a, b) => [200, addComment(needPr(n), b.as || 'maint', b.body)]);
ctl('POST', '/pr/:n/inline', (req, { n }, a, b) => {
	const pr = needPr(n);
	const line = b.line === '' || b.line == null ? null : Number(b.line);
	if (line != null) {
		const lines = diffLines(pr, b.path);
		if (!lines?.has(line)) throw httpError(422, `line ${line} of ${b.path} is not part of the diff`);
	}
	return [200, addThread(pr, b.as || 'maint', { path: b.path, line, body: b.body })];
});
ctl('POST', '/pr/:n/reply', (req, { n }, a, b) => [200, addReply(needPr(n), b.as || 'maint', Number(b.thread), b.body)]);
ctl('POST', '/pr/:n/review', async (req, { n }, a, b) => {
	const pr = needPr(n);
	const review = addReview(pr, b.as || 'maint', { body: b.body || '', event: b.event || 'COMMENT' });
	await reviewEvent(pr, review);
	return [200, review];
});
ctl('POST', '/review/:rid/dismiss', async (req, { rid }) => {
	const r = S.reviews.find((x) => x.id === Number(rid));
	if (!r) throw httpError(404, 'review not found');
	r.state = 'DISMISSED';
	touch(needPr(r.pr));
	return [200, r];
});
ctl('POST', '/thread/:tid/resolve', (req, { tid }, a, b) => {
	const t = S.threads.find((x) => x.id === Number(tid));
	if (!t) throw httpError(404, 'thread not found');
	t.resolved = b.resolved !== false && b.resolved !== 'false';
	touch(needPr(t.pr));
	return [200, t];
});
ctl('POST', '/thread/:tid/outdated', (req, { tid }, a, b) => {
	const t = S.threads.find((x) => x.id === Number(tid));
	if (!t) throw httpError(404, 'thread not found');
	t.forcedOutdated = b.outdated !== false && b.outdated !== 'false';
	touch(needPr(t.pr));
	return [200, t];
});
ctl('POST', '/pr/:n/ai-review', (req, { n }, a, b) => {
	// Mirrors .github AI review: a summary issue comment + a review whose inline comments are the findings.
	const pr = needPr(n);
	const sha = headSha(pr);
	const findings = b.findings || [];
	const summary =
		b.summary ||
		`<!-- ofd-ai-review -->\n<!-- ofd-ai-review:spent=0.02 -->\n**Automated review** of \`${sha.slice(0, 7)}\` · how this works\n\n${findings.length} finding(s). _(AI opinion; a maintainer decides.)_`;
	const prior = S.comments.find((c) => c.pr === pr.number && c.user === 'github-actions' && c.body.includes('<!-- ofd-ai-review -->'));
	if (prior) {
		prior.body = summary;
		prior.updated_at = now();
	} else addComment(pr, 'github-actions', summary);
	const review = addReview(pr, 'github-actions', { body: 'AI review: see the summary comment.', event: 'COMMENT', comments: findings.map((f) => ({ path: f.path, line: f.line ?? null, body: f.body })) });
	return [200, review];
});
ctl('POST', '/pr/:n/close', async (req, { n }, a, b) => (await closePr(needPr(n), b.as || 'maint', { comment: b.comment }), [200, { ok: true }]));
ctl('POST', '/pr/:n/reopen', async (req, { n }, a, b) => (await reopenPr(needPr(n), b.as || 'maint'), [200, { ok: true }]));
ctl('POST', '/pr/:n/merge', async (req, { n }, a, b) => [200, { sha: await mergePr(needPr(n), b.as || 'maint') }]);
ctl('POST', '/pr/:n/maintainer-can-modify', (req, { n }, a, b) => {
	const pr = needPr(n);
	pr.maintainer_can_modify = b.value !== false && b.value !== 'false';
	touch(pr);
	return [200, prRest(pr)];
});
ctl('POST', '/pr/:n/bulk-comments', (req, { n }, a, b) => {
	const pr = needPr(n);
	for (let i = 0; i < Number(b.count || 120); i++) addComment(pr, i % 2 ? 'maint' : 'maint2', `Bulk comment ${i + 1}`);
	return [200, { ok: true }];
});
ctl('POST', '/main/commit', (req, p, a, b) => [200, { sha: commitFiles(UPSTREAM, 'main', b.files || {}, b.message || 'Direct commit to main', b.as || 'maint') }]);
ctl('POST', '/checks', (req, p, a, b) => ((S.checks.failing = b.failing || []), [200, S.checks]));
ctl('POST', '/pr/create', async (req, p, a, b) => {
	// A non-web-editor PR from a contributor's fork (e.g. their `main`).
	const login = b.as || 'outsider';
	const key = `${login}/${REPO}`;
	if (!S.repos.has(key)) S.repos.set(key, { owner: login, name: REPO, refs: new Map([['heads/main', S.repos.get(UPSTREAM).refs.get('heads/main')]]), forkOf: UPSTREAM });
	const branch = b.branch || 'main';
	const repo = S.repos.get(key);
	if (!repo.refs.has(`heads/${branch}`)) repo.refs.set(`heads/${branch}`, S.repos.get(UPSTREAM).refs.get('heads/main'));
	commitFiles(key, branch, b.files || {}, b.title || 'Contributor change', login);
	const t = now();
	const pr = { number: S.nextNumber++, title: b.title || 'Contributor change', body: b.body || '', user: login, headRepo: key, headRef: branch, state: 'open', merged: false, merged_at: null, closed_at: null, created_at: t, updated_at: t, maintainer_can_modify: true, lastHeadSha: null };
	S.pulls.push(pr);
	await prEvent(pr, 'opened', login);
	return [200, prRest(pr)];
});

// --- Maintainer UI ---
on('GET', '/', () => [200, renderIndex({ S, UPSTREAM, prRest, GH_USERS })]);
on('GET', '/__outbox', () => [200, renderOutbox(S.outbox)]);
on('GET', `/${UPSTREAM}/pull/:n`, (req, { n }) => {
	const pr = needPr(n);
	const sha = headSha(pr);
	const main = S.repos.get(UPSTREAM).refs.get('heads/main');
	const files = sha ? git.diffTrees(git.getCommit(git.mergeBase(main, sha)).tree, git.getCommit(sha).tree) : [];
	return [200, renderPr({ pr: prRest(pr), raw: pr, files, gql: gqlPullRequest(pr), threads: S.threads.filter((t) => t.pr === pr.number), GH_USERS })];
});
on('GET', `/${UPSTREAM}/pull/:n/file`, (req, { n }, a, b, url) => {
	const pr = needPr(n);
	const p = url.searchParams.get('path');
	const lines = fileLines(headSha(pr), p);
	return [200, renderFile({ n: pr.number, path: p, lines, diff: diffLines(pr, p) })];
});
on('GET', '/:owner', (req, { owner }) => [200, `<p>Fake GitHub profile: <b>${owner}</b></p>`]);

// Dataset API (static files of an `ofd build` output dir)
function serveDataset(req, res, url) {
	if (!DATASET_DIR) return false;
	if (!url.pathname.startsWith('/dataset/')) return false;
	const rel = decodeURIComponent(url.pathname.slice('/dataset/'.length));
	const file = path.join(DATASET_DIR, rel);
	if (!file.startsWith(DATASET_DIR)) return send(res, 403, { message: 'forbidden' }), true;
	fs.readFile(fs.existsSync(file) && fs.statSync(file).isDirectory() ? path.join(file, 'index.json') : file, (err, data) => {
		if (err) return send(res, 404, { message: 'Not Found' });
		const type = file.endsWith('.json') ? 'application/json' : file.endsWith('.svg') ? 'image/svg+xml' : file.endsWith('.png') ? 'image/png' : 'application/octet-stream';
		res.writeHead(200, { 'content-type': type, 'access-control-allow-origin': '*' });
		res.end(data);
	});
	return true;
}

const server = http.createServer(async (req, res) => {
	const url = new URL(req.url, BASE);
	try {
		if (req.method === 'OPTIONS') {
			return send(res, 204, '', { 'access-control-allow-methods': '*', 'access-control-allow-headers': '*' });
		}
		if (req.method === 'GET' && serveDataset(req, res, url)) return;
		const auth = authOf(req);
		for (const r of routes) {
			if (r.method !== req.method) continue;
			const m = r.re.exec(url.pathname);
			if (!m) continue;
			const params = Object.fromEntries(r.keys.map((k, i) => [k, m[i + 1]]));
			const body = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method) ? await readBody(req) : {};
			const [status, out, headers] = await r.fn(req, params, auth, body, url);
			const isApi = /^\/(repos|user|graphql|app)\b/.test(url.pathname) || url.pathname.startsWith('/login/oauth/access_token');
			if (isApi)
				log(`${req.method} ${url.pathname}${url.search} -> ${status} [${auth?.kind === 'app' ? 'app' : auth?.login || auth?.kind || 'anon'}]`);
			return send(res, status, out, headers);
		}
		log(`UNHANDLED ${req.method} ${url.pathname}${url.search}`);
		send(res, 404, { message: `fake-github: no route for ${req.method} ${url.pathname}` });
	} catch (e) {
		if (e instanceof HttpError) {
			log(`${req.method} ${url.pathname} -> ${e.status} ${e.message}`);
			return send(res, e.status, { message: e.message, ...(e.extra ? { errors: e.extra } : {}), documentation_url: 'https://docs.github.com/rest' });
		}
		console.error(e);
		send(res, 500, { message: String(e.stack || e) });
	}
});

await reset();
server.listen(PORT, () => {
	console.log(`[fake-github] listening on ${BASE}  (upstream ${UPSTREAM}, repo ${REPO_DIR}${DATASET_DIR ? `, dataset ${DATASET_DIR}` : ''})`);
	console.log(`[fake-github] webhooks -> ${WEBHOOK_TARGET}`);
});
