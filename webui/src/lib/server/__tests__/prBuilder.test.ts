/**
 * Tests for prBuilder no-op delete handling and canonical-identity preservation.
 *
 * A delete whose target entity has no files in the upstream repo (never
 * published, or already removed) can't be expressed as a PR. buildTreeItems
 * must treat it as a no-op (produce no tree items) and report it via
 * noopDeletes, and explainEmptyTree must turn that into an actionable message.
 *
 * A create/update replaces the whole file, so it must also carry over the uuid
 * and moved_from already committed at that path when its payload has none.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
	getRecursiveTree: vi.fn(),
	getBlobText: vi.fn(
		async (_token: string, _owner: string, _repo: string, _sha: string): Promise<string | null> =>
			null
	),
	createBlob: vi.fn(
		async (_token: string, _owner: string, _repo: string, _content: string, _encoding?: string) =>
			'blob-sha'
	)
}));

vi.mock('$lib/server/github', () => ({
	getRecursiveTree: mocks.getRecursiveTree,
	getBlobText: mocks.getBlobText,
	createBlob: mocks.createBlob
}));

import { buildTreeItems, explainEmptyTree } from '../prBuilder';

const VARIANT_PATH = 'brands/acme/materials/pla/filaments/pla+/variants/oliver_green';
const VARIANT_REPO_FILE = 'data/acme/PLA/pla+/oliver_green/variant.json';
const SIZES_REPO_FILE = 'data/acme/PLA/pla+/oliver_green/sizes.json';

beforeEach(() => {
	vi.clearAllMocks();
	mocks.getRecursiveTree.mockResolvedValue(new Map());
	mocks.getBlobText.mockImplementation(async () => null);
	mocks.createBlob.mockImplementation(async () => 'blob-sha');
});

function deleteChange() {
	return [
		{
			entity: { type: 'variant', path: VARIANT_PATH, id: 'oliver_green' },
			operation: 'delete',
			description: 'Deleted variant "Oliver Green"'
		}
	];
}

describe('buildTreeItems — delete cascade', () => {
	it('records a no-op delete when the entity is absent from the upstream tree', async () => {
		// Upstream tree has unrelated files only — nothing under the deleted dir.
		mocks.getRecursiveTree.mockResolvedValue(
			new Map([['data/other/brand.json', { sha: 's', mode: '100644', type: 'blob' }]])
		);

		const result = await buildTreeItems(
			'tok', 'fork', 'repo', 'base-tree', 'up', 'repo', deleteChange(), undefined
		);

		expect(result.treeItems).toHaveLength(0);
		expect(result.noopDeletes).toEqual([
			{ path: VARIANT_PATH, description: 'Deleted variant "Oliver Green"' }
		]);
	});

	it('emits delete tree items when the entity exists upstream', async () => {
		mocks.getRecursiveTree.mockResolvedValue(
			new Map([[VARIANT_REPO_FILE, { sha: 's', mode: '100644', type: 'blob' }]])
		);

		const result = await buildTreeItems(
			'tok', 'fork', 'repo', 'base-tree', 'up', 'repo', deleteChange(), undefined
		);

		expect(result.noopDeletes).toHaveLength(0);
		expect(result.treeItems).toEqual([{ path: VARIANT_REPO_FILE, sha: null }]);
	});
});

describe('buildTreeItems — canonical identity', () => {
	const VARIANT_UUID = '198ad03f-0920-4b0e-9e4b-4ec25c1c311a';
	const SIZE_UUID = 'eb9f63cf-529d-430e-ae3b-f4bf2f825b50';

	function variantChange(data: Record<string, unknown>) {
		return [
			{
				entity: { type: 'variant', path: VARIANT_PATH, id: 'oliver_green' },
				// The case that broke PR #442: a `create` staged before the entity was
				// published, submitted again after it had merged and been assigned a uuid.
				operation: 'create',
				data,
				description: 'Created variant "Oliver Green"'
			}
		];
	}

	function publishedVariant() {
		mocks.getRecursiveTree.mockResolvedValue(
			new Map([
				[VARIANT_REPO_FILE, { sha: 'variant-sha', mode: '100644', type: 'blob' }],
				[SIZES_REPO_FILE, { sha: 'sizes-sha', mode: '100644', type: 'blob' }]
			])
		);
		mocks.getBlobText.mockImplementation(async (_token, _owner, _repo, sha) => {
			if (sha === 'variant-sha') {
				return JSON.stringify({ uuid: VARIANT_UUID, id: 'oliver_green', name: 'Oliver Green' });
			}
			if (sha === 'sizes-sha') {
				return JSON.stringify([{ uuid: SIZE_UUID, filament_weight: 1000, diameter: 1.75 }]);
			}
			return null;
		});
	}

	/** The JSON handed to createBlob, keyed by the tree path it was written to. */
	async function build(changes: any[]) {
		const result = await buildTreeItems(
			'tok', 'fork', 'repo', 'base-tree', 'up', 'repo', changes, undefined
		);
		const written = new Map<string, any>();
		result.treeItems.forEach((item, i) => {
			written.set(item.path, JSON.parse(mocks.createBlob.mock.calls[i][3]));
		});
		return written;
	}

	it('keeps the committed uuid when the payload has none', async () => {
		publishedVariant();

		const written = await build(
			variantChange({ id: 'oliver_green', name: 'Oliver Green', color_hex: '#2C4562' })
		);

		expect(written.get(VARIANT_REPO_FILE).uuid).toBe(VARIANT_UUID);
	});

	it('keeps a spool uuid, paired by (filament_weight, diameter)', async () => {
		publishedVariant();

		const written = await build(
			variantChange({
				id: 'oliver_green',
				name: 'Oliver Green',
				sizes: [{ filament_weight: 1000, diameter: 1.75, discontinued: false }]
			})
		);

		expect(written.get(SIZES_REPO_FILE)[0].uuid).toBe(SIZE_UUID);
	});

	it('writes a genuinely new entity without inventing a uuid', async () => {
		const written = await build(variantChange({ id: 'oliver_green', name: 'Oliver Green' }));

		expect(mocks.getBlobText).not.toHaveBeenCalled();
		expect(written.get(VARIANT_REPO_FILE)).not.toHaveProperty('uuid');
	});

	it('keeps the uuid the payload carries', async () => {
		publishedVariant();

		const written = await build(
			variantChange({ uuid: 'payload-uuid', id: 'oliver_green', name: 'Oliver Green' })
		);

		expect(written.get(VARIANT_REPO_FILE).uuid).toBe('payload-uuid');
	});

	it('survives an unparseable committed file', async () => {
		mocks.getRecursiveTree.mockResolvedValue(
			new Map([[VARIANT_REPO_FILE, { sha: 'variant-sha', mode: '100644', type: 'blob' }]])
		);
		mocks.getBlobText.mockResolvedValue('{ not json');

		const written = await build(variantChange({ id: 'oliver_green', name: 'Oliver Green' }));

		expect(written.get(VARIANT_REPO_FILE).name).toBe('Oliver Green');
	});
});

describe('explainEmptyTree', () => {
	it('falls back to a plain message with no skips', () => {
		expect(explainEmptyTree([], [])).toBe('No changes to submit.');
	});

	it('explains a single no-op delete using its description', () => {
		const msg = explainEmptyTree([], [{ path: VARIANT_PATH, description: 'Deleted variant "Oliver Green"' }]);
		expect(msg).toContain('Deleted variant "Oliver Green"');
		expect(msg).toMatch(/isn't in the database/);
	});

	it('explains multiple no-op deletes', () => {
		const msg = explainEmptyTree([], [
			{ path: 'a', description: 'A' },
			{ path: 'b', description: 'B' }
		]);
		expect(msg).toContain('A, B');
		expect(msg).toMatch(/aren't in the database/);
	});

	it('reports unmappable skipped paths', () => {
		const msg = explainEmptyTree(['weird/path'], []);
		expect(msg).toContain('weird/path');
		expect(msg).toMatch(/couldn't be mapped/);
	});
});
