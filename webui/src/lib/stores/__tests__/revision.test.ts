/**
 * Loading a pull request into the editor for revision (stores/revision.ts, and
 * changeStore.loadRevision underneath).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';

vi.mock('$app/environment', () => ({ browser: true }));
vi.mock('$lib/stores/environment', () => ({
	useChangeTracking: {
		subscribe(fn: (v: boolean) => void) {
			fn(true);
			return () => {};
		}
	}
}));
const imageDbStore: Record<string, string> = {};
vi.mock('$lib/services/imageDb', () => ({
	setImage: vi.fn(async (key: string, data: string) => {
		imageDbStore[key] = data;
	}),
	getImage: vi.fn(async (key: string) => imageDbStore[key] ?? null),
	removeImage: vi.fn(async () => {}),
	removeImages: vi.fn(async () => {}),
	clearAll: vi.fn(async () => {
		for (const k of Object.keys(imageDbStore)) delete imageDbStore[k];
	}),
	getAllKeys: vi.fn(async () => Object.keys(imageDbStore))
}));

import { changeStore } from '../changes';
import {
	revisionStore,
	feedbackForEntity,
	generalFeedback,
	changedSinceLoaded,
	isAddressed,
	pendingData
} from '../revision';
import { STORAGE_KEY_ACTIVE_REVISION } from '$lib/config/storageKeys';
import type { FeedbackItem, PrChangesResponse } from '$lib/types/feedback';

const VARIANT = 'brands/insignia/materials/PLA/filaments/glitter_pla/variants/night_saphire';
const FILAMENT = 'brands/insignia/materials/PLA/filaments/glitter_pla';

const typo: FeedbackItem = {
	id: 't1',
	kind: 'inline',
	source: 'ai',
	author: 'github-actions',
	body: 'The colour name is misspelled.',
	url: 'https://github.com/o/r/pull/827#t1',
	createdAt: '2026-10-30T23:00:00Z',
	outdated: false,
	location: {
		repoPath: 'data/insignia/PLA/glitter_pla/night_saphire/variant.json',
		line: 3,
		entityPath: VARIANT,
		entityType: 'variant',
		pointer: '/name',
		label: 'name'
	}
};
const general: FeedbackItem = {
	id: 'c1',
	kind: 'comment',
	source: 'maintainer',
	author: 'maintainer',
	body: 'Thanks! A couple of things.',
	url: '',
	createdAt: '2026-10-31T00:00:00Z',
	outdated: false
};

function response(overrides: Partial<PrChangesResponse> = {}): PrChangesResponse {
	return {
		prNumber: 827,
		headSha: 'head-sha',
		mergeBaseSha: 'base',
		mainSha: 'main',
		kind: 'bot',
		changes: [
			{
				entity: { type: 'filament', path: FILAMENT, id: 'glitter_pla' },
				operation: 'create',
				data: { id: 'glitter_pla', name: 'Glitter PLA' },
				originalData: null
			},
			{
				entity: { type: 'variant', path: VARIANT, id: 'night_saphire' },
				operation: 'create',
				data: { id: 'night_saphire', name: 'Night Saphire', color_hex: '#1B1F3B', sizes: [] },
				originalData: null
			},
			{
				entity: { type: 'brand', path: 'brands/insignia', id: 'insignia' },
				operation: 'update',
				data: { id: 'insignia', name: 'Insignia', website: 'https://www.bestbuy.com' },
				originalData: { id: 'insignia', name: 'Insignia', website: 'https://Bestbuy.com' }
			}
		],
		images: [
			{ entityPath: 'brands/insignia', filename: 'logo.png', mimeType: 'image/png', data: 'iVBOR' }
		],
		conflicts: [],
		otherFiles: [],
		title: 'Add Night Saphire variant to insignia Glitter PLA',
		url: 'https://github.com/o/r/pull/827',
		uuid: '4df9035c-eff0-4bfc-b4df-4c109ec197cc',
		feedback: [typo, general],
		access: {
			allowed: true,
			as: 'submitter',
			via: 'bot',
			mode: 'amend',
			kind: 'bot',
			isMaintainer: false
		},
		...overrides
	};
}

function mockFetchOnce(status: number, body: unknown) {
	(globalThis.fetch as any).mockResolvedValueOnce({
		ok: status >= 200 && status < 300,
		status,
		json: async () => body
	});
}

beforeEach(() => {
	revisionStore.clear({ discardChanges: true });
	(globalThis.fetch as any).mockReset();
	// Schema lookups fail in tests, which leaves data unfiltered.
	(globalThis.fetch as any).mockRejectedValue(new Error('offline'));
});

describe('revisionStore.load', () => {
	it('replaces the change set with the PR and remembers the revision', async () => {
		changeStore.trackCreate(
			{ type: 'brand', path: 'brands/unrelated', id: 'unrelated' },
			{ id: 'unrelated', name: 'X' }
		);
		mockFetchOnce(200, response());

		const result = await revisionStore.load(827);

		expect(result.ok).toBe(true);
		expect(globalThis.fetch).toHaveBeenCalledWith('/api/submissions/827/changes');
		const set = get(changeStore);
		expect(set._index.has('brands/unrelated')).toBe(false);
		expect(set._index.get(VARIANT)?.change?.operation).toBe('create');
		expect(set._index.get(FILAMENT)?.change?.operation).toBe('create');
		const brand = set._index.get('brands/insignia')?.change;
		expect(brand?.operation).toBe('update');
		expect(brand?.propertyChanges?.map((p) => p.property)).toEqual(['website']);
		expect(set.images['brands/insignia:logo']).toMatchObject({
			entityPath: 'brands/insignia',
			property: 'logo',
			filename: 'logo.png'
		});

		const revision = get(revisionStore)!;
		expect(revision).toMatchObject({
			prNumber: 827,
			mode: 'amend',
			as: 'submitter',
			via: 'bot',
			headSha: 'head-sha'
		});
		expect(revision.baseline).toEqual({ t1: 'Night Saphire' });
		expect(JSON.parse(localStorage.getItem(STORAGE_KEY_ACTIVE_REVISION)!).prNumber).toBe(827);
	});

	it('reports refusals without touching the change set', async () => {
		changeStore.trackCreate(
			{ type: 'brand', path: 'brands/keep', id: 'keep' },
			{ id: 'keep', name: 'Keep' }
		);
		mockFetchOnce(401, {
			error: 'Sign in with the SimplyPrint account that made this submission.',
			access: { allowed: false, signIn: 'simplyprint', kind: 'bot', isMaintainer: false }
		});

		const result = await revisionStore.load(827);

		expect(result).toMatchObject({ ok: false, status: 401, access: { signIn: 'simplyprint' } });
		expect(get(changeStore)._index.has('brands/keep')).toBe(true);
		expect(get(revisionStore)).toBeNull();
	});

	it('clear() can keep or discard the loaded changes', async () => {
		mockFetchOnce(200, response());
		await revisionStore.load(827);
		revisionStore.clear();
		expect(get(revisionStore)).toBeNull();
		expect(get(changeStore)._index.has(VARIANT)).toBe(true);

		mockFetchOnce(200, response());
		await revisionStore.load(827);
		revisionStore.clear({ discardChanges: true });
		expect(get(changeStore)._index.has(VARIANT)).toBe(false);
		expect(localStorage.getItem(STORAGE_KEY_ACTIVE_REVISION)).toBeNull();
	});
});

describe('feedback helpers', () => {
	it('splits feedback by entity and tells when a field changed since loading', async () => {
		mockFetchOnce(200, response());
		const { revision } = (await revisionStore.load(827)) as any;

		expect(feedbackForEntity(revision, VARIANT)).toEqual([typo]);
		expect(feedbackForEntity(revision, FILAMENT)).toEqual([]);
		expect(generalFeedback(revision)).toEqual([general]);

		expect(changedSinceLoaded(revision, typo, { name: 'Night Saphire' })).toBe(false);
		expect(changedSinceLoaded(revision, typo, { name: 'Night Sapphire' })).toBe(true);
		expect(changedSinceLoaded(revision, general, {})).toBe(false);
	});
});

describe('isAddressed', () => {
	it('counts an item once its field changed or it was marked done', async () => {
		mockFetchOnce(200, response());
		await revisionStore.load(827);
		const addressed = () => isAddressed(get(revisionStore)!, typo, pendingData(VARIANT));
		expect(addressed()).toBe(false);

		const variant = get(changeStore)._index.get(VARIANT)!.change!;
		changeStore.trackCreate(variant.entity, { ...variant.data, name: 'Night Sapphire' });
		expect(addressed()).toBe(true);

		changeStore.trackCreate(variant.entity, { ...variant.data, name: 'Night Saphire' });
		expect(addressed()).toBe(false);
		revisionStore.setDone('t1', true);
		expect(addressed()).toBe(true);
	});
});

describe('clearing the changes', () => {
	it('does not make the feedback look addressed', async () => {
		mockFetchOnce(200, response());
		await revisionStore.load(827);
		changeStore.clear();
		expect(isAddressed(get(revisionStore)!, typo, pendingData(VARIANT))).toBe(false);
	});
});

