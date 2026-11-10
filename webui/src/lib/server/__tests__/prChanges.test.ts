/**
 * Rebuilding a PR as an editor change set (prChanges.ts), and the repo path ↔ entity path
 * mapping it relies on.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const gh = vi.hoisted(() => ({
	trees: {} as Record<string, Record<string, string>>,
	files: [] as { filename: string; status: string; previous_filename?: string }[]
}));

vi.mock('$lib/server/github', () => ({
	getPullRequestDetails: vi.fn(),
	getPullRequestFiles: vi.fn(async () => gh.files),
	getMergeBase: vi.fn(async () => 'base'),
	getLatestCommitSha: vi.fn(async () => 'main'),
	getCommitTreeSha: vi.fn(async (_t: string, _o: string, _r: string, sha: string) => `tree:${sha}`),
	// Each tree maps path → content; the blob SHA is the content itself.
	getRecursiveTree: vi.fn(async (_t: string, _o: string, _r: string, treeSha: string) => {
		const tree = gh.trees[treeSha.replace('tree:', '')] ?? {};
		return new Map(
			Object.entries(tree).map(([path, content]) => [
				path,
				{ sha: content, mode: '100644', type: 'blob' }
			])
		);
	}),
	getBlobText: vi.fn(async (_t: string, _o: string, _r: string, sha: string) => sha),
	getBlobBase64: vi.fn(async (_t: string, _o: string, _r: string, sha: string) =>
		Buffer.from(sha).toString('base64')
	)
}));

import { merge3, merge2, deepEqual, loadPrChanges } from '$lib/server/prChanges';
import { repoPathToEntityPath, entityPathToRepoPath } from '$lib/server/prBuilder';
import type { PullRequestDetails } from '$lib/server/github';

const j = (v: unknown) => JSON.stringify(v, null, 2) + '\n';

const PR: PullRequestDetails = {
	number: 820,
	title: 'Update Filament Database',
	body: '',
	html_url: 'https://github.com/o/r/pull/820',
	state: 'open',
	merged: false,
	draft: false,
	author: 'contributor',
	author_type: 'User',
	updated_at: '2026-11-01T00:00:00Z',
	closed_at: null,
	head_sha: 'head',
	head_ref: 'ofd-changes-1793377165446',
	head_owner: 'contributor',
	head_repo: 'open-filament-database',
	base_ref: 'main',
	base_sha: 'base',
	maintainer_can_modify: true
};

const F = 'data/sunlu/PLA/high_speed_matte_pla';

beforeEach(() => {
	gh.trees = {};
	gh.files = [];
});

describe('merge3', () => {
	it('takes whichever side changed', () => {
		expect(merge3({ a: 1 }, { a: 1 }, { a: 2 })).toEqual({ a: 2 });
		expect(merge3({ a: 1 }, { a: 3 }, { a: 1 })).toEqual({ a: 3 });
		expect(merge3({ a: 1 }, { a: 3 }, { a: 3 })).toEqual({ a: 3 });
	});

	it('merges objects key by key, keeping fields main added', () => {
		const conflicts: string[] = [];
		const merged = merge3(
			{ name: 'Grey', color_hex: '#808080' },
			{ name: 'Grey', color_hex: '#63666A' },
			{ name: 'Grey', color_hex: '#808080', uuid: 'u-1', dry_time: 4 },
			conflicts
		);
		expect(merged).toEqual({ name: 'Grey', color_hex: '#63666A', uuid: 'u-1', dry_time: 4 });
		expect(conflicts).toEqual([]);
	});

	it('lets the PR win a conflict and reports where', () => {
		const conflicts: string[] = [];
		expect(merge3({ a: { b: 1 } }, { a: { b: 2 } }, { a: { b: 3 } }, conflicts)).toEqual({
			a: { b: 2 }
		});
		expect(conflicts).toEqual(['/a/b']);
	});

	it('keeps a key the PR removed removed', () => {
		expect(merge3({ a: 1, b: 2 }, { a: 1 }, { a: 1, b: 2, c: 3 })).toEqual({ a: 1, c: 3 });
	});

	it('merges same-length arrays element-wise and takes other arrays whole', () => {
		expect(
			merge3([{ w: 1 }, { w: 2 }], [{ w: 1, g: 'x' }, { w: 2 }], [{ w: 1 }, { w: 2, uuid: 'u' }])
		).toEqual([
			{ w: 1, g: 'x' },
			{ w: 2, uuid: 'u' }
		]);
		const conflicts: string[] = [];
		expect(merge3([1], [1, 2], [1, 3], conflicts)).toEqual([1, 2]);
		expect(conflicts).toEqual(['']);
	});

	it('merge2 lays the PR over an entity main added independently', () => {
		const conflicts: string[] = [];
		const merged = merge2(
			{
				uuid: 'u-1',
				id: 'cherry_red',
				name: 'Cherry Red',
				color_hex: '#FD404B',
				color_standards: { ral: '3018' }
			},
			{ id: 'cherry_red', name: 'Cherry Red', color_hex: '#C8102E' },
			conflicts
		);
		expect(merged).toEqual({
			uuid: 'u-1',
			id: 'cherry_red',
			name: 'Cherry Red',
			color_hex: '#C8102E',
			color_standards: { ral: '3018' }
		});
		expect(conflicts).toEqual(['/color_hex']);
	});

	it('deepEqual ignores key order', () => {
		expect(deepEqual({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 })).toBe(true);
		expect(deepEqual({ a: 1 }, { a: 1, b: undefined })).toBe(true);
		expect(deepEqual([1, 2], [2, 1])).toBe(false);
	});
});

describe('repoPathToEntityPath', () => {
	it.each([
		['stores/amazon_us/store.json', 'stores/amazon_us', 'store', ''],
		['data/sunlu/brand.json', 'brands/sunlu', 'brand', ''],
		['data/sunlu/PLA/material.json', 'brands/sunlu/materials/PLA', 'material', ''],
		[
			`${F}/filament.json`,
			'brands/sunlu/materials/PLA/filaments/high_speed_matte_pla',
			'filament',
			''
		],
		[
			`${F}/black/variant.json`,
			'brands/sunlu/materials/PLA/filaments/high_speed_matte_pla/variants/black',
			'variant',
			''
		],
		[
			`${F}/black/sizes.json`,
			'brands/sunlu/materials/PLA/filaments/high_speed_matte_pla/variants/black',
			'variant',
			'/sizes'
		]
	])('%s → %s', (repoPath, entityPath, type, pointerPrefix) => {
		expect(repoPathToEntityPath(repoPath)).toEqual({
			entityPath,
			type,
			pointerPrefix,
			isEntityJson: true
		});
		if (!repoPath.endsWith('sizes.json')) expect(entityPathToRepoPath(entityPath)).toBe(repoPath);
	});

	it('maps a logo to its entity but not as entity JSON', () => {
		expect(repoPathToEntityPath('data/sunlu/logo.png')).toMatchObject({
			entityPath: 'brands/sunlu',
			isEntityJson: false
		});
	});

	it('rejects paths outside the data tree', () => {
		expect(repoPathToEntityPath('docs/webui.md')).toBeNull();
		expect(repoPathToEntityPath('data/a/B/c/d/e/variant.json')).toBeNull();
		expect(repoPathToEntityPath('data/../etc/passwd')).toBeNull();
	});
});

describe('loadPrChanges', () => {
	it('rebuilds creates, updates (rebased on main) and deletes', async () => {
		const greyBase = { id: 'grey', name: 'Grey', color_hex: '#808080' };
		gh.trees.base = {
			[`${F}/filament.json`]: j({ id: 'f', name: 'High Speed Matte PLA' }),
			[`${F}/grey/variant.json`]: j(greyBase),
			[`${F}/grey/sizes.json`]: j([{ filament_weight: 1000, diameter: 1.75 }]),
			[`${F}/old/variant.json`]: j({ id: 'old', name: 'Old' }),
			[`${F}/old/sizes.json`]: j([])
		};
		gh.trees.head = {
			[`${F}/filament.json`]: j({ id: 'f', name: 'High Speed Matte PLA' }),
			[`${F}/grey/variant.json`]: j({ ...greyBase, color_hex: '#63666A' }),
			[`${F}/grey/sizes.json`]: j([{ filament_weight: 1000, diameter: 1.75 }]),
			[`${F}/white/variant.json`]: j({ id: 'white', name: 'White', color_hex: '#FFFFFF' }),
			[`${F}/white/sizes.json`]: j([{ filament_weight: 1000, diameter: 1.75 }])
		};
		// Main backfilled a field and a UUID on Grey since the PR branched.
		gh.trees.main = {
			...gh.trees.base,
			[`${F}/grey/variant.json`]: j({ ...greyBase, uuid: 'u-grey', dry_time: 4 })
		};
		gh.files = [
			{ filename: `${F}/grey/variant.json`, status: 'modified' },
			{ filename: `${F}/white/variant.json`, status: 'added' },
			{ filename: `${F}/white/sizes.json`, status: 'added' },
			{ filename: `${F}/old/variant.json`, status: 'removed' },
			{ filename: `${F}/old/sizes.json`, status: 'removed' }
		];

		const result = await loadPrChanges('token', 820, PR);
		expect(result).not.toBeNull();
		const byPath = Object.fromEntries(
			result!.changes.map((c) => [c.entity.path.split('/').at(-1), c])
		);

		expect(byPath.grey.operation).toBe('update');
		expect(byPath.grey.data).toEqual({
			...greyBase,
			color_hex: '#63666A',
			uuid: 'u-grey',
			dry_time: 4,
			sizes: [{ filament_weight: 1000, diameter: 1.75 }]
		});
		expect(byPath.grey.originalData.color_hex).toBe('#808080');

		expect(byPath.white).toMatchObject({
			operation: 'create',
			entity: { type: 'variant', id: 'white' },
			data: { name: 'White', sizes: [{ filament_weight: 1000, diameter: 1.75 }] },
			originalData: null
		});
		expect(byPath.old).toMatchObject({ operation: 'delete', data: null });
		expect(result!.conflicts).toEqual([]);
		expect(result!.kind).toBe('fork');
		expect(result!.headSha).toBe('head');
	});

	it('keeps only the top-most delete and orders parents first', async () => {
		gh.trees.base = {
			[`${F}/filament.json`]: j({ id: 'f' }),
			[`${F}/a/variant.json`]: j({ id: 'a' }),
			'data/sunlu/PLA/new_line/filament.json': '',
			'data/sunlu/brand.json': j({ id: 'sunlu' })
		};
		delete gh.trees.base['data/sunlu/PLA/new_line/filament.json'];
		gh.trees.main = { ...gh.trees.base };
		gh.trees.head = {
			'data/sunlu/brand.json': j({ id: 'sunlu' }),
			'data/sunlu/PLA/new_line/filament.json': j({ id: 'new_line' }),
			'data/sunlu/PLA/new_line/v/variant.json': j({ id: 'v' })
		};
		gh.files = [
			{ filename: `${F}/filament.json`, status: 'removed' },
			{ filename: `${F}/a/variant.json`, status: 'removed' },
			{ filename: 'data/sunlu/PLA/new_line/v/variant.json', status: 'added' },
			{ filename: 'data/sunlu/PLA/new_line/filament.json', status: 'added' },
			{ filename: 'README.md', status: 'modified' }
		];

		const result = await loadPrChanges('token', 820, PR);
		expect(
			result!.changes.map((c) => [c.operation, c.entity.path.split('/').slice(-1)[0]])
		).toEqual([
			['delete', 'high_speed_matte_pla'],
			['create', 'new_line'],
			['create', 'v']
		]);
		expect(result!.otherFiles).toEqual(['README.md']);
	});

	it('loads a changed logo as an image and keeps its entity', async () => {
		const brand = j({ id: 'sunlu', name: 'Sunlu', logo: 'logo.png' });
		gh.trees.base = { 'data/sunlu/brand.json': brand, 'data/sunlu/logo.png': 'old-png' };
		gh.trees.main = { ...gh.trees.base };
		gh.trees.head = { 'data/sunlu/brand.json': brand, 'data/sunlu/logo.png': 'new-png' };
		gh.files = [{ filename: 'data/sunlu/logo.png', status: 'modified' }];

		const result = await loadPrChanges('token', 820, PR);
		expect(result!.changes).toHaveLength(1);
		expect(result!.changes[0]).toMatchObject({
			operation: 'update',
			entity: { path: 'brands/sunlu' }
		});
		expect(result!.images).toEqual([
			{
				entityPath: 'brands/sunlu',
				filename: 'logo.png',
				mimeType: 'image/png',
				data: Buffer.from('new-png').toString('base64')
			}
		]);
	});

	it('reports an entity main deleted while the PR changed it', async () => {
		gh.trees.base = { 'data/sunlu/brand.json': j({ id: 'sunlu', name: 'Sunlu' }) };
		gh.trees.main = {};
		gh.trees.head = { 'data/sunlu/brand.json': j({ id: 'sunlu', name: 'SUNLU' }) };
		gh.files = [{ filename: 'data/sunlu/brand.json', status: 'modified' }];

		const result = await loadPrChanges('token', 820, PR);
		expect(result!.changes[0]).toMatchObject({ operation: 'create', data: { name: 'SUNLU' } });
		expect(result!.conflicts).toEqual([{ entityPath: 'brands/sunlu', pointer: '' }]);
	});
});
