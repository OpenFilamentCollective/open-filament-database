/**
 * Email templates (email.ts): the call-to-action button, the feedback list, escaping.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('zeptomail', () => ({ SendMailClient: vi.fn() }));

import {
	changesRequestedEmail,
	emailButton,
	feedbackListText,
	rejectedEmail,
	returnedEmail
} from '$lib/server/email';
import type { FeedbackItem } from '$lib/types/feedback';

const PR_URL = 'https://github.com/o/r/pull/827';
const PAGE = 'https://editor.example/submissions/827';

const items: FeedbackItem[] = [
	{
		id: 't1',
		kind: 'inline',
		source: 'ai',
		author: 'github-actions',
		body: 'The colour name is misspelled.',
		url: '',
		createdAt: '',
		outdated: false,
		location: {
			repoPath: 'data/insignia/PLA/glitter_pla/night_saphire/variant.json',
			line: 3,
			entityPath: 'brands/insignia/materials/PLA/filaments/glitter_pla/variants/night_saphire',
			entityType: 'variant',
			pointer: '/name',
			label: 'name'
		}
	},
	{
		id: 'c1',
		kind: 'comment',
		source: 'maintainer',
		author: 'maintainer',
		body: 'Use <b>the</b> datasheet & not the shop page.',
		url: '',
		createdAt: '',
		outdated: false
	}
];

describe('emailButton', () => {
	it('is a table cell button with the link and label, escaped', () => {
		const html = emailButton('https://x.example/a?b=1&c=2', 'Fix <it>');
		expect(html).toContain('<table role="presentation"');
		expect(html).toContain('href="https://x.example/a?b=1&amp;c=2"');
		expect(html).toContain('>Fix &lt;it&gt;</a>');
		expect(html).toContain('background-color: #3784e1');
	});
});

describe('returnedEmail', () => {
	it('lists the feedback and links the submission page with a button', () => {
		const email = returnedEmail(827, PR_URL, items, PAGE);
		expect(email.subject).toBe('Your filament submission needs a few changes');
		expect(email.html).toContain(`href="${PAGE}"`);
		expect(email.html).toContain('Fix it in the web editor</a>');
		expect(email.html).toContain('See it on GitHub');
		expect(email.html).toContain('night saphire · name');
		// Comment text is escaped, never rendered as HTML.
		expect(email.html).toContain('Use &lt;b&gt;the&lt;/b&gt; datasheet &amp; not the shop page.');
		expect(email.html).not.toContain('<b>the</b>');
		expect(email.text).toContain(`Fix it in the web editor: ${PAGE}`);
		expect(email.text).toContain('2 things to fix');
	});

	it('falls back to a pull request button without a submission page', () => {
		const email = returnedEmail(827, PR_URL, items);
		expect(email.html).toContain(`href="${PR_URL}"`);
		expect(email.html).toContain('See it on GitHub</a>');
		expect(email.html).not.toContain('Fix it in the web editor</a>');
	});
});

describe('other emails', () => {
	it('changes requested quotes the review and lists every item', () => {
		const email = changesRequestedEmail(827, PR_URL, 'Please fix <these>', items, PAGE);
		expect(email.html).toContain('Please fix &lt;these&gt;');
		expect(email.html).toContain('All feedback so far');
		expect(email.html).toContain('Fix it in the web editor</a>');
	});

	it('rejected shows the reason and links the submission', () => {
		const email = rejectedEmail(827, PR_URL, 'Duplicate of #800', PAGE);
		expect(email.subject).toContain('was not accepted');
		expect(email.html).toContain('Duplicate of #800');
		expect(email.html).toContain('View your submission</a>');
	});

	it('numbers items in the text version', () => {
		expect(feedbackListText(items)).toBe(
			'1. night saphire · name (Automated review (unverified)):\nThe colour name is misspelled.\n\n2. General (maintainer):\nUse <b>the</b> datasheet & not the shop page.'
		);
	});
});
