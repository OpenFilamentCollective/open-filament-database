/**
 * The feedback rules (feedback.ts), on fixtures modelled on #820 (a fork PR with two AI
 * review runs) and #827 (a bot PR with resolved threads).
 */
import { describe, it, expect } from 'vitest';
import {
	selectFeedback,
	isNote,
	rejectReason,
	prKind,
	cleanBody,
	jsonPathAtLine,
	lineOfPath,
	pointerFromPath,
	labelFromPointer,
	feedbackToText,
	type RawPullRequest,
	type RawThread,
	type RawThreadComment,
	type RawReview,
	type RawComment
} from '$lib/server/feedback';

const human = (login: string) => ({ login, __typename: 'User' });
const ai = { login: 'github-actions', __typename: 'Bot' };
const otherBot = { login: 'ofd-repo-bot', __typename: 'Bot' };

let nextId = 1;
function comment(
	author: RawComment['author'],
	body: string,
	createdAt = '2026-10-31T10:00:00Z'
): RawComment {
	const id = nextId++;
	return { databaseId: id, body, url: `https://github.com/o/r/pull/1#c${id}`, createdAt, author };
}
function review(
	author: RawReview['author'],
	body: string,
	state: string,
	submittedAt: string
): RawReview {
	return { ...comment(author, body, submittedAt), state, submittedAt };
}
function threadComment(
	author: RawThreadComment['author'],
	body: string,
	reviewId: number | null,
	replyTo: number | null = null,
	createdAt = '2026-10-31T10:00:00Z'
): RawThreadComment {
	return {
		...comment(author, body, createdAt),
		pullRequestReview: reviewId === null ? null : { databaseId: reviewId },
		replyTo: replyTo === null ? null : { databaseId: replyTo },
		commit: { oid: 'head' },
		originalCommit: { oid: 'orig' }
	};
}
function thread(
	path: string,
	line: number,
	comments: RawThreadComment[],
	opts: Partial<RawThread> = {}
): RawThread {
	return {
		isResolved: false,
		isOutdated: false,
		path,
		line,
		originalLine: line,
		diffSide: 'RIGHT',
		comments: { nodes: comments },
		...opts
	};
}
function pr(
	opts: Partial<RawPullRequest> & Pick<RawPullRequest, 'author' | 'headRefName'>
): RawPullRequest {
	const comments = opts.comments ?? { totalCount: 0, nodes: [] };
	const reviews = opts.reviews ?? { totalCount: 0, nodes: [] };
	const reviewThreads = opts.reviewThreads ?? { totalCount: 0, nodes: [] };
	return {
		number: 1,
		title: 'Update Filament Database',
		url: 'https://github.com/o/r/pull/1',
		state: 'OPEN',
		merged: false,
		updatedAt: '2026-11-01T00:00:00Z',
		closedAt: null,
		body: '',
		headRefOid: 'head',
		headRepository: { name: 'r', owner: { login: 'contributor' } },
		maintainerCanModify: true,
		...opts,
		comments,
		reviews,
		reviewThreads
	};
}

const VARIANT = 'data/sunlu/PLA/high_speed_matte_pla/grey/variant.json';
const SIZES = 'data/sunlu/PLA/high_speed_matte_pla/chocolate/sizes.json';

describe('rule helpers', () => {
	it.each([
		['Note to self: figure out why this PR is behind main.', true],
		['note: this is fine', true],
		['NOTE - internal', true],
		['**Note:** bold', true],
		['> Notes for the bot', true],
		['Another more applicable note is that this site does not exist?', false],
		['Notable issue here', false],
		['This is a link to the store listing, not the datasheet.', false]
	])('isNote(%j) is %s', (body, expected) => {
		expect(isNote(body)).toBe(expected);
	});

	it('extracts the rejection reason', () => {
		expect(rejectReason('Rejected: duplicate of #800')).toBe('duplicate of #800');
		expect(rejectReason('reject - not a real product')).toBe('not a real product');
		expect(rejectReason('REJECT')).toBe('');
		expect(rejectReason('Rejecting this one, sorry')).toBe('this one, sorry');
		expect(rejectReason('This should be rejected')).toBeNull();
	});

	it('tells PR kinds apart by branch', () => {
		expect(prKind('ofd-anon-4df9035c-eff0-4bfc-b4df-4c109ec197cc')).toBe('bot');
		expect(prKind('ofd-changes-1793377165446')).toBe('fork');
		expect(prKind('more_fields')).toBe('other');
	});

	it('cleans bodies for display', () => {
		expect(cleanBody('<!-- marker -->\nHello')).toBe('Hello');
		expect(cleanBody('See <img width="370" alt="image" src="https://x/y.png" />')).toBe(
			'See [image: https://x/y.png]'
		);
		expect(cleanBody('Found it:\n\n```suggestion\n  "name": "Night Sapphire",\n```')).toBe(
			'Found it:\n\nSuggested change:\n  "name": "Night Sapphire",'
		);
		expect(cleanBody('```suggestion\n```')).toBe('Suggested change: remove these lines');
		expect(cleanBody('🟡 Misspelled name. _(unverified: AI opinion)_')).toBe('🟡 Misspelled name.');
	});
});

describe('selectFeedback', () => {
	it('fork PR (#820): newest AI run, human replies, minus notes and the author', () => {
		const oldAi = review(
			ai,
			'AI review: see the summary comment.',
			'COMMENTED',
			'2026-10-30T17:00:00Z'
		);
		const newAi = review(
			ai,
			'AI review: see the summary comment.',
			'COMMENTED',
			'2026-10-31T09:00:00Z'
		);
		const maintainerReview = review(human('maintainer'), '', 'COMMENTED', '2026-10-31T08:00:00Z');

		const oldChocolate = threadComment(ai, '🟡 Same ASIN as Black (old run).', oldAi.databaseId);
		const authorReply = threadComment(
			human('contributor'),
			'The correct link is https://amazon.com/dp/X',
			null,
			oldChocolate.databaseId
		);
		const oldGrey = threadComment(ai, '🔵 color_hex changed to a string.', oldAi.databaseId);
		const noteReply = threadComment(
			human('maintainer'),
			"Note: This is totally fine and shouldn't be flagged.",
			maintainerReview.databaseId,
			oldGrey.databaseId
		);
		const oldSunlu = threadComment(ai, '🔵 Sunlu links are generic.', oldAi.databaseId);
		const maintainerReply = threadComment(
			human('maintainer'),
			"Another more applicable note is that this site doesn't seem to exist?",
			maintainerReview.databaseId,
			oldSunlu.databaseId,
			'2026-10-31T08:00:00Z'
		);
		const newChocolate = threadComment(
			ai,
			'🟡 Same ASIN as Black (new run).',
			newAi.databaseId,
			null,
			'2026-10-31T09:00:00Z'
		);

		const result = selectFeedback(
			pr({
				author: human('contributor'),
				headRefName: 'ofd-changes-1793377165446',
				comments: {
					totalCount: 2,
					nodes: [
						comment(
							human('maintainer'),
							'Note to self: figure out why this PR seems to be so far behind main.'
						),
						comment(ai, '<!-- ofd-ai-review -->\n## Automated review\n...')
					]
				},
				reviews: { totalCount: 3, nodes: [oldAi, maintainerReview, newAi] },
				reviewThreads: {
					totalCount: 4,
					nodes: [
						thread(SIZES, 18, [oldChocolate, authorReply]),
						thread(VARIANT, 5, [oldGrey, noteReply]),
						thread('data/sunlu/PLA/high_speed_matte_pla/sakura_pink/sizes.json', 14, [
							oldSunlu,
							maintainerReply
						]),
						thread(SIZES, 18, [newChocolate])
					]
				}
			})
		);

		expect(result.pr.kind).toBe('fork');
		expect(result.rejectComment).toBeNull();
		expect(result.items.map((i) => [i.source, i.body])).toEqual([
			['maintainer', "Another more applicable note is that this site doesn't seem to exist?"],
			['ai', '🟡 Same ASIN as Black (new run).']
		]);
		// A reply carries what it replies to, even when that comment doesn't count itself.
		expect(result.items[0].context).toEqual({
			author: 'github-actions',
			excerpt: '🔵 Sunlu links are generic.'
		});
		expect(result.items[1].location).toMatchObject({ repoPath: SIZES, line: 18 });
	});

	it('bot PR (#827): resolved threads drop out entirely, the bot author is no one', () => {
		const aiReview = review(
			ai,
			'AI review: see the summary comment.',
			'COMMENTED',
			'2026-10-30T23:00:00Z'
		);
		const typo = threadComment(ai, '🟡 The colour name is misspelled.', aiReview.databaseId);
		const drying = threadComment(ai, '🔵 The drying fields are empty.', aiReview.databaseId);
		const dryingReply = threadComment(
			human('maintainer'),
			'This is up to the bot to add, not to complain about.',
			null,
			drying.databaseId
		);
		const datasheet = threadComment(
			human('maintainer'),
			'This is a link to the store listing, not the datasheet.',
			null
		);

		const result = selectFeedback(
			pr({
				author: { login: 'ofd-anon-pr-bot', __typename: 'Bot' },
				headRefName: 'ofd-anon-4df9035c-eff0-4bfc-b4df-4c109ec197cc',
				comments: {
					totalCount: 1,
					nodes: [
						comment(
							human('maintainer'),
							'Note to self: reject this PR once proper "changes system" is in place.'
						)
					]
				},
				reviews: { totalCount: 1, nodes: [aiReview] },
				reviewThreads: {
					totalCount: 3,
					nodes: [
						thread('data/insignia/PLA/glitter_pla/night_saphire/variant.json', 3, [typo]),
						thread('data/insignia/PLA/glitter_pla/filament.json', 1, [drying, dryingReply], {
							isResolved: true
						}),
						thread('data/insignia/PLA/glitter_pla/filament.json', 11, [datasheet])
					]
				}
			})
		);

		expect(result.pr.kind).toBe('bot');
		expect(result.items.map((i) => i.body)).toEqual([
			'🟡 The colour name is misspelled.',
			'This is a link to the store listing, not the datasheet.'
		]);
	});

	it('takes the latest maintainer "Reject" comment as the reason, not as feedback', () => {
		const result = selectFeedback(
			pr({
				author: human('contributor'),
				headRefName: 'ofd-changes-1',
				comments: {
					totalCount: 3,
					nodes: [
						comment(human('maintainer'), 'Reject: older reason', '2026-10-31T10:00:00Z'),
						comment(human('maintainer'), 'Rejected: duplicate of #800', '2026-11-01T10:00:00Z'),
						comment(human('contributor'), 'Reject my own PR please', '2026-11-02T10:00:00Z')
					]
				}
			})
		);
		expect(result.items).toEqual([]);
		expect(result.rejectComment).toMatchObject({
			author: 'maintainer',
			reason: 'duplicate of #800'
		});
	});

	it('skips commands, empty bodies, other bots, dismissed and pending reviews', () => {
		const result = selectFeedback(
			pr({
				author: human('contributor'),
				headRefName: 'ofd-changes-1',
				comments: {
					totalCount: 3,
					nodes: [
						comment(human('maintainer'), '/review'),
						comment(otherBot, 'Brand sign-off: pending'),
						comment(human('maintainer'), 'Please add the GTIN from the spool label.')
					]
				},
				reviews: {
					totalCount: 4,
					nodes: [
						review(human('maintainer'), 'Withdrawn', 'DISMISSED', '2026-10-31T10:00:00Z'),
						review(human('maintainer'), 'Draft', 'PENDING', '2026-10-31T10:00:00Z'),
						review(human('maintainer'), '', 'CHANGES_REQUESTED', '2026-10-31T10:00:00Z'),
						review(
							human('brand-rep'),
							'The density is 1.24, not 1.2.',
							'CHANGES_REQUESTED',
							'2026-10-31T11:00:00Z'
						)
					]
				}
			})
		);
		expect(result.items.map((i) => [i.kind, i.author, i.body])).toEqual([
			['comment', 'maintainer', 'Please add the GTIN from the spool label.'],
			['review', 'brand-rep', 'The density is 1.24, not 1.2.']
		]);
	});

	it('uses the original line for outdated threads and flags truncation', () => {
		const result = selectFeedback(
			pr({
				author: human('contributor'),
				headRefName: 'ofd-changes-1',
				reviewThreads: {
					totalCount: 150,
					nodes: [
						thread(VARIANT, 9, [threadComment(human('maintainer'), 'Wrong hex', null)], {
							isOutdated: true,
							line: null,
							originalLine: 5
						})
					]
				}
			})
		);
		expect(result.items[0]).toMatchObject({ outdated: true, location: { line: 5 } });
		expect(result.truncated).toBe(true);
	});
});

describe('line → JSON pointer', () => {
	const sizes = JSON.stringify(
		[
			{
				filament_weight: 1000,
				diameter: 1.75,
				purchase_links: [
					{ store_id: 'sunlu', url: 'https://sunlu.com/x' },
					{ store_id: 'amazon_us', url: 'https://www.amazon.com/dp/B0F6T4N2HB' }
				]
			}
		],
		null,
		2
	);
	const lineOf = (needle: string) => sizes.split('\n').findIndex((l) => l.includes(needle)) + 1;

	it('finds the property on a line', () => {
		expect(jsonPathAtLine(sizes, lineOf('B0F6T4N2HB'))).toEqual([0, 'purchase_links', 1, 'url']);
		expect(jsonPathAtLine(sizes, lineOf('"diameter"'))).toEqual([0, 'diameter']);
	});

	it('resolves an object-opening line to the array element', () => {
		const line =
			sizes.split('\n').findIndex((l, i) => l.trim() === '{' && i > lineOf('purchase_links') - 1) +
			1;
		expect(jsonPathAtLine(sizes, line)).toEqual([0, 'purchase_links', 0]);
	});

	it('handles the root, out-of-range lines and non-JSON', () => {
		expect(jsonPathAtLine(sizes, 1)).toEqual([]);
		expect(jsonPathAtLine(sizes, 0)).toBeNull();
		expect(jsonPathAtLine(sizes, 10_000)).toBeNull();
		expect(jsonPathAtLine('not json', 1)).toBeNull();
	});

	it('finds the line of a path, the inverse of jsonPathAtLine', () => {
		const line = lineOfPath(sizes, [0, 'purchase_links', 1, 'url']);
		expect(line).toBe(lineOf('B0F6T4N2HB'));
		expect(jsonPathAtLine(sizes, line!)).toEqual([0, 'purchase_links', 1, 'url']);
		expect(lineOfPath(sizes, [0, 'missing'])).toBeNull();
	});

	it('builds pointers and labels', () => {
		const pointer = pointerFromPath('/sizes', [0, 'purchase_links', 1, 'url']);
		expect(pointer).toBe('/sizes/0/purchase_links/1/url');
		expect(labelFromPointer(pointer)).toBe('sizes › 1 › purchase links › 2 › url');
		expect(pointerFromPath('', ['a/b', 'c~d'])).toBe('/a~1b/c~0d');
		expect(labelFromPointer('')).toBeNull();
	});
});

describe('feedbackToText', () => {
	it('numbers items with where and who', () => {
		const text = feedbackToText([
			{
				id: 't1',
				kind: 'inline',
				source: 'ai',
				author: 'github-actions',
				body: 'Misspelled.',
				url: '',
				createdAt: '',
				outdated: false,
				location: {
					repoPath: 'data/x/brand.json',
					line: 3,
					entityPath: 'brands/x',
					entityType: 'brand',
					pointer: '/name',
					label: 'name'
				}
			},
			{
				id: 'c1',
				kind: 'comment',
				source: 'maintainer',
				author: 'maintainer',
				body: 'Thanks!',
				url: '',
				createdAt: '',
				outdated: false
			}
		]);
		expect(text).toBe(
			'1. brands/x (name), from Automated review:\nMisspelled.\n\n2. General, from maintainer:\nThanks!'
		);
	});
});
