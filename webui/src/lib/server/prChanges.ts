/**
 * Rebuild a pull request's changes as an editor change set, so a contributor (or a
 * maintainer) can load the PR into the web editor, fix it, and push the fix back.
 *
 * The change set is read from the PR itself, not from what the submitter's browser or our
 * database remembers. That way it includes suggestion commits a maintainer added on GitHub,
 * and it works for PRs we never tracked.
 *
 * Each entity is **rebased onto current main** with a 3-way JSON merge (merge-base → PR head
 * vs merge-base → main). A PR that has fallen far behind (#820) would otherwise write its stale
 * copy over fields main has backfilled since. When both sides changed the same value, the PR
 * wins and the field is reported in `conflicts`.
 */
import { env as privateEnv } from '$env/dynamic/private';
import {
	getPullRequestDetails,
	getPullRequestFiles,
	getMergeBase,
	getLatestCommitSha,
	getCommitTreeSha,
	getRecursiveTree,
	getBlobText,
	getBlobBase64,
	type PullRequestDetails
} from '$lib/server/github';
import { repoPathToEntityPath, type RepoFileEntity } from '$lib/server/prBuilder';
import { prKind, type PrKind } from '$lib/server/feedback';

import type { LoadedChange, LoadedImage } from '$lib/types/feedback';
export type { LoadedChange, LoadedImage };

export interface PrChangeSet {
	prNumber: number;
	headSha: string;
	mergeBaseSha: string;
	mainSha: string;
	kind: PrKind;
	changes: LoadedChange[];
	images: LoadedImage[];
	/** Fields both the PR and main changed since the PR branched; the PR's value was kept. */
	conflicts: { entityPath: string; pointer: string }[];
	/** Changed files that aren't editor entities; a push carries them over untouched. */
	otherFiles: string[];
}

type Tree = Map<string, { sha: string; mode: string; type: string }>;

const IMAGE_TYPES: Record<string, string> = {
	png: 'image/png',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	webp: 'image/webp',
	svg: 'image/svg+xml',
	gif: 'image/gif'
};

// --- 3-way JSON merge (pure; exported for tests) ---

function isPlainObject(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function deepEqual(a: unknown, b: unknown): boolean {
	if (a === b) return true;
	if (Array.isArray(a) && Array.isArray(b)) {
		return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
	}
	if (isPlainObject(a) && isPlainObject(b)) {
		const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
		for (const k of keys) if (!deepEqual(a[k], b[k])) return false;
		return true;
	}
	return false;
}

function clone<T>(v: T): T {
	return v === undefined ? v : JSON.parse(JSON.stringify(v));
}

/**
 * Merge `head`'s changes since `base` onto `main`. Objects merge key by key; arrays merge
 * element by element when all three have the same length and are otherwise taken whole.
 * When both sides changed a value differently the PR (`head`) wins and `pointer` is pushed
 * to `conflicts`. `undefined` means "absent", so a key the PR removed stays removed.
 */
export function merge3(
	base: unknown,
	head: unknown,
	main: unknown,
	conflicts: string[] = [],
	pointer = ''
): unknown {
	if (deepEqual(head, base)) return clone(main);
	if (deepEqual(main, base)) return clone(head);
	if (deepEqual(head, main)) return clone(head);

	if (isPlainObject(base) && isPlainObject(head) && isPlainObject(main)) {
		const out: Record<string, unknown> = {};
		// Key order: the PR's, then anything only main has.
		const keys = [...new Set([...Object.keys(head), ...Object.keys(main), ...Object.keys(base)])];
		for (const k of keys) {
			const v = merge3(
				base[k],
				head[k],
				main[k],
				conflicts,
				`${pointer}/${k.replace(/~/g, '~0').replace(/\//g, '~1')}`
			);
			if (v !== undefined) out[k] = v;
		}
		return out;
	}
	if (
		Array.isArray(base) &&
		Array.isArray(head) &&
		Array.isArray(main) &&
		base.length === head.length &&
		head.length === main.length
	) {
		return base.map((_, i) => merge3(base[i], head[i], main[i], conflicts, `${pointer}/${i}`));
	}
	conflicts.push(pointer);
	return clone(head);
}

/**
 * Lay the PR's version over main's when both added the same entity independently (#820's
 * new colours also arrived on main via #831). There is no common base, so keys only main has
 * (its UUID, backfilled fields) are kept, the PR's values win elsewhere, and every value the
 * two disagree on is reported in `conflicts`.
 */
export function merge2(
	main: unknown,
	head: unknown,
	conflicts: string[] = [],
	pointer = ''
): unknown {
	if (deepEqual(main, head)) return clone(head);
	if (isPlainObject(main) && isPlainObject(head)) {
		const out: Record<string, unknown> = {};
		const keys = [...new Set([...Object.keys(head), ...Object.keys(main)])];
		for (const k of keys) {
			const child = `${pointer}/${k.replace(/~/g, '~0').replace(/\//g, '~1')}`;
			if (!(k in head)) out[k] = clone(main[k]);
			else if (!(k in main)) out[k] = clone(head[k]);
			else out[k] = merge2(main[k], head[k], conflicts, child);
		}
		return out;
	}
	if (Array.isArray(main) && Array.isArray(head) && main.length === head.length) {
		return head.map((_, i) => merge2(main[i], head[i], conflicts, `${pointer}/${i}`));
	}
	conflicts.push(pointer);
	return clone(head);
}

// --- Reading entities out of trees ---

/** The repo path of an entity's own JSON file. */
function entityJsonPath(dir: string, type: RepoFileEntity['type']): string {
	return `${dir}/${type}.json`;
}

/** The directory of the entity a repo file belongs to. */
function entityDir(repoPath: string, entity: RepoFileEntity): string {
	const depth: Record<RepoFileEntity['type'], number> = {
		store: 2,
		brand: 2,
		material: 3,
		filament: 4,
		variant: 5
	};
	return repoPath.split('/').slice(0, depth[entity.type]).join('/');
}

/** Read one entity's editor data from a tree: its JSON file, plus `sizes` for a variant. */
async function readEntity(
	read: (tree: Tree, path: string) => Promise<any | null>,
	tree: Tree,
	dir: string,
	type: RepoFileEntity['type']
): Promise<any | null> {
	const data = await read(tree, entityJsonPath(dir, type));
	if (!data || typeof data !== 'object') return null;
	if (type === 'variant') {
		const sizes = await read(tree, `${dir}/sizes.json`);
		if (Array.isArray(sizes)) data.sizes = sizes;
	}
	return data;
}

function upstream(): { owner: string; repo: string } {
	const owner = privateEnv.GITHUB_UPSTREAM_OWNER;
	const repo = privateEnv.GITHUB_UPSTREAM_REPO;
	if (!owner || !repo)
		throw new Error('GITHUB_UPSTREAM_OWNER / GITHUB_UPSTREAM_REPO are not configured');
	return { owner, repo };
}

/**
 * Rebuild PR `prNumber` as an editor change set. `token` must be able to read upstream;
 * the PR's head commit is read through upstream, which keeps fork PR commits too.
 */
export async function loadPrChanges(
	token: string,
	prNumber: number,
	details?: PullRequestDetails
): Promise<PrChangeSet | null> {
	const { owner, repo } = upstream();
	const pr = details ?? (await getPullRequestDetails(token, owner, repo, prNumber));
	if (!pr) return null;

	const [files, mainSha] = await Promise.all([
		getPullRequestFiles(token, owner, repo, prNumber),
		getLatestCommitSha(token, owner, repo, pr.base_ref)
	]);
	const mergeBaseSha = await getMergeBase(token, owner, repo, mainSha, pr.head_sha);

	const [headTree, baseTree, mainTree] = await Promise.all(
		[pr.head_sha, mergeBaseSha, mainSha].map(async (sha) =>
			getRecursiveTree(token, owner, repo, await getCommitTreeSha(token, owner, repo, sha))
		)
	);

	// Blob reads, deduplicated by SHA: most of a variant reads the same blob three times.
	const blobs = new Map<string, Promise<any | null>>();
	const read = (tree: Tree, path: string): Promise<any | null> => {
		const entry = tree.get(path);
		if (!entry) return Promise.resolve(null);
		if (!blobs.has(entry.sha)) {
			blobs.set(
				entry.sha,
				getBlobText(token, owner, repo, entry.sha).then((text) => {
					if (text === null) return null;
					try {
						return JSON.parse(text);
					} catch {
						return null;
					}
				})
			);
		}
		// Each caller gets its own copy; the merge mutates nothing, but callers may.
		return blobs.get(entry.sha)!.then((v) => (v === null ? null : clone(v)));
	};

	// Group the changed files by entity.
	const entities = new Map<string, { entity: RepoFileEntity; dir: string; nonJson: string[] }>();
	const otherFiles: string[] = [];
	const touch = (path: string) => {
		const entity = repoPathToEntityPath(path);
		if (!entity) {
			otherFiles.push(path);
			return;
		}
		const key = entity.entityPath;
		if (!entities.has(key))
			entities.set(key, { entity, dir: entityDir(path, entity), nonJson: [] });
		if (!entity.isEntityJson) entities.get(key)!.nonJson.push(path);
	};
	for (const f of files) {
		touch(f.filename);
		if (f.previous_filename) touch(f.previous_filename);
	}

	const changes: LoadedChange[] = [];
	const conflicts: { entityPath: string; pointer: string }[] = [];
	const images: LoadedImage[] = [];

	await Promise.all(
		[...entities.values()].map(async ({ entity, dir, nonJson }) => {
			const [base, head, main] = await Promise.all([
				readEntity(read, baseTree, dir, entity.type),
				readEntity(read, headTree, dir, entity.type),
				readEntity(read, mainTree, dir, entity.type)
			]);
			const id = entity.entityPath.split('/').at(-1)!;
			const ident = { type: entity.type, path: entity.entityPath, id };

			if (!head) {
				// The PR deletes the entity. Already gone on main means nothing to do.
				if (base && main)
					changes.push({ entity: ident, operation: 'delete', data: null, originalData: main });
				return;
			}
			if (!main) {
				// New in the PR, or deleted on main since the PR branched: either way a create.
				if (base) conflicts.push({ entityPath: entity.entityPath, pointer: '' });
				changes.push({ entity: ident, operation: 'create', data: head, originalData: null });
			} else {
				const fieldConflicts: string[] = [];
				const data = base
					? merge3(base, head, main, fieldConflicts)
					: merge2(main, head, fieldConflicts);
				for (const pointer of fieldConflicts)
					conflicts.push({ entityPath: entity.entityPath, pointer });
				// A PR that only touched a logo still loads the entity, so the image has a home.
				if (!deepEqual(data, main) || nonJson.length > 0) {
					changes.push({ entity: ident, operation: 'update', data, originalData: main });
				}
			}

			for (const path of nonJson) {
				const ext = path.split('.').at(-1)?.toLowerCase() ?? '';
				const entry = headTree.get(path);
				if (!IMAGE_TYPES[ext] || !entry) continue;
				const data = await getBlobBase64(token, owner, repo, entry.sha);
				if (data) {
					images.push({
						entityPath: entity.entityPath,
						filename: path.split('/').at(-1)!,
						mimeType: IMAGE_TYPES[ext],
						data
					});
				}
			}
		})
	);

	// A deleted entity's descendants are deleted with it: keep only the top-most delete.
	const deleted = changes.filter((c) => c.operation === 'delete').map((c) => c.entity.path);
	const kept = changes.filter(
		(c) => !deleted.some((d) => c.entity.path !== d && c.entity.path.startsWith(`${d}/`))
	);
	// Parents before children, so the editor creates a filament before its variants.
	kept.sort(
		(a, b) =>
			a.entity.path.split('/').length - b.entity.path.split('/').length ||
			a.entity.path.localeCompare(b.entity.path)
	);

	return {
		prNumber,
		headSha: pr.head_sha,
		mergeBaseSha,
		mainSha,
		kind: prKind(pr.head_ref),
		changes: kept,
		images,
		conflicts,
		otherFiles
	};
}
