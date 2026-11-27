// In-memory git object store with real git SHA-1 hashing.
// Trees are stored flat (path -> {mode, sha}) and hashed the way git hashes nested trees,
// so tree SHAs seeded from the real repo match `git rev-parse HEAD^{tree}`.
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const sha1 = (buf) => crypto.createHash('sha1').update(buf).digest('hex');

export class GitStore {
	constructor(repoDir) {
		this.repoDir = repoDir;
		/** sha -> { type:'blob', content?:Buffer } | { type:'tree', flat:Map } | { type:'commit', ... } */
		this.objects = new Map();
	}

	// --- blobs ---
	putBlob(content) {
		const buf = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
		const sha = sha1(Buffer.concat([Buffer.from(`blob ${buf.length}\0`), buf]));
		if (!this.objects.has(sha) || !this.objects.get(sha).content) {
			this.objects.set(sha, { type: 'blob', content: buf });
		}
		return sha;
	}

	hasBlob(sha) {
		return this.objects.get(sha)?.type === 'blob';
	}

	getBlob(sha) {
		const o = this.objects.get(sha);
		if (!o || o.type !== 'blob') return null;
		if (!o.content) {
			// Seeded lazily from the real repo.
			o.content = execFileSync('git', ['cat-file', 'blob', sha], {
				cwd: this.repoDir,
				maxBuffer: 256 * 1024 * 1024
			});
		}
		return o.content;
	}

	// --- trees (flat) ---
	/** Hash a flat tree; returns root sha and registers it. Also returns subtree shas. */
	putTree(flat) {
		const { sha, subtrees } = hashFlatTree(flat);
		if (!this.objects.has(sha)) this.objects.set(sha, { type: 'tree', flat, subtrees });
		return sha;
	}

	getTree(sha) {
		const o = this.objects.get(sha);
		return o && o.type === 'tree' ? o : null;
	}

	// --- commits ---
	putCommit({ tree, parents, message, author, date }) {
		const who = `${author.name} <${author.email}> ${Math.floor(new Date(date).getTime() / 1000)} +0000`;
		const text =
			`tree ${tree}\n` +
			parents.map((p) => `parent ${p}\n`).join('') +
			`author ${who}\ncommitter ${who}\n\n${message}\n`;
		const body = Buffer.from(text, 'utf8');
		const sha = sha1(Buffer.concat([Buffer.from(`commit ${body.length}\0`), body]));
		this.objects.set(sha, { type: 'commit', tree, parents, message, author, date });
		return sha;
	}

	getCommit(sha) {
		const o = this.objects.get(sha);
		return o && o.type === 'commit' ? o : null;
	}

	/** All ancestors of a commit (inclusive). */
	ancestors(sha) {
		const seen = new Set();
		const stack = [sha];
		while (stack.length) {
			const s = stack.pop();
			if (!s || seen.has(s)) continue;
			seen.add(s);
			const c = this.getCommit(s);
			if (c) stack.push(...c.parents);
		}
		return seen;
	}

	/** Nearest common ancestor (BFS from head over ancestors of base). */
	mergeBase(base, head) {
		const baseAnc = this.ancestors(base);
		const queue = [head];
		const seen = new Set();
		while (queue.length) {
			const s = queue.shift();
			if (seen.has(s)) continue;
			seen.add(s);
			if (baseAnc.has(s)) return s;
			const c = this.getCommit(s);
			if (c) queue.push(...c.parents);
		}
		return null;
	}

	/** Seed from a real commit (blobs loaded lazily). Returns the commit sha used. */
	async seedFrom(rev = 'HEAD') {
		const out = execFileSync('git', ['ls-tree', '-r', '-z', rev], {
			cwd: this.repoDir,
			maxBuffer: 512 * 1024 * 1024
		}).toString('utf8');
		const flat = new Map();
		for (const rec of out.split('\0')) {
			if (!rec) continue;
			const tab = rec.indexOf('\t');
			const [mode, type, sha] = rec.slice(0, tab).split(' ');
			if (type !== 'blob') continue; // submodules (commit) ignored
			flat.set(rec.slice(tab + 1), { mode, sha });
			if (!this.objects.has(sha)) this.objects.set(sha, { type: 'blob' });
		}
		const treeSha = this.putTree(flat);
		const realTree = execFileSync('git', ['rev-parse', `${rev}^{tree}`], { cwd: this.repoDir })
			.toString()
			.trim();
		if (treeSha !== realTree) {
			console.warn(`[fake-github] WARNING: computed tree ${treeSha} != git ${realTree}`);
		}
		const msg = execFileSync('git', ['log', '-1', '--format=%s', rev], { cwd: this.repoDir })
			.toString()
			.trim();
		return this.putCommit({
			tree: treeSha,
			parents: [],
			message: `Seed: ${msg}`,
			author: { name: 'seed', email: 'seed@fake.test' },
			date: new Date().toISOString()
		});
	}

	/** Diff two flat trees -> [{filename, status, previous_filename?, sha}] */
	diffTrees(baseSha, headSha) {
		const a = baseSha ? this.getTree(baseSha).flat : new Map();
		const b = this.getTree(headSha).flat;
		const added = [];
		const removed = [];
		const files = [];
		for (const [p, e] of b) {
			const old = a.get(p);
			if (!old) added.push({ filename: p, sha: e.sha });
			else if (old.sha !== e.sha || old.mode !== e.mode)
				files.push({ filename: p, status: 'modified', sha: e.sha });
		}
		for (const [p, e] of a) if (!b.has(p)) removed.push({ filename: p, sha: e.sha });
		// Exact-content rename detection (GitHub also does similarity; this is the common case).
		for (const add of added) {
			const i = removed.findIndex((r) => r.sha === add.sha);
			if (i >= 0) {
				const [r] = removed.splice(i, 1);
				files.push({ filename: add.filename, status: 'renamed', previous_filename: r.filename, sha: add.sha });
			} else files.push({ filename: add.filename, status: 'added', sha: add.sha });
		}
		for (const r of removed) files.push({ filename: r.filename, status: 'removed', sha: r.sha });
		files.sort((x, y) => (x.filename < y.filename ? -1 : 1));
		return files;
	}
}

// git sorts tree entries by name, with directories compared as "name/".
function hashFlatTree(flat) {
	const root = { dirs: new Map(), files: new Map() };
	for (const [path, e] of flat) {
		const parts = path.split('/');
		let node = root;
		for (let i = 0; i < parts.length - 1; i++) {
			if (!node.dirs.has(parts[i])) node.dirs.set(parts[i], { dirs: new Map(), files: new Map() });
			node = node.dirs.get(parts[i]);
		}
		node.files.set(parts[parts.length - 1], e);
	}
	const subtrees = new Map(); // dir path -> sha
	const hashNode = (node, prefix) => {
		const entries = [];
		for (const [name, child] of node.dirs) {
			const sha = hashNode(child, prefix ? `${prefix}/${name}` : name);
			entries.push({ name, sortKey: name + '/', mode: '40000', sha });
		}
		for (const [name, e] of node.files) entries.push({ name, sortKey: name, mode: e.mode, sha: e.sha });
		entries.sort((x, y) => Buffer.compare(Buffer.from(x.sortKey), Buffer.from(y.sortKey)));
		const body = Buffer.concat(
			entries.map((e) => Buffer.concat([Buffer.from(`${e.mode} ${e.name}\0`), Buffer.from(e.sha, 'hex')]))
		);
		const sha = sha1(Buffer.concat([Buffer.from(`tree ${body.length}\0`), body]));
		if (prefix) subtrees.set(prefix, sha);
		return sha;
	};
	const sha = hashNode(root, '');
	return { sha, subtrees };
}

export { sha1 };
