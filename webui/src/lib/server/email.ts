/**
 * ZeptoMail email notifications for PR lifecycle events.
 * Sends notifications to submitters when their PRs are merged, closed, or need changes.
 *
 * Each email is built by a pure template function (`returnedEmail`, …) so the layout can be
 * tested and previewed (`/api/dev/preview/<pr>?email=…` in development) without sending anything.
 */
import { SendMailClient } from 'zeptomail';
import { env as privateEnv } from '$env/dynamic/private';
import type { FeedbackItem } from '$lib/types/feedback';

let client: any | null = null;

function getClient(): any | null {
	if (client) return client;
	if (!privateEnv.ZEPTOMAIL_TOKEN) {
		console.warn('[Email] ZeptoMail not configured — missing ZEPTOMAIL_TOKEN');
		return null;
	}

	const url = privateEnv.ZEPTOMAIL_API_URL || 'api.zeptomail.eu/';
	const token = privateEnv.ZEPTOMAIL_TOKEN!.startsWith('Zoho-enczapikey ')
		? privateEnv.ZEPTOMAIL_TOKEN!
		: `Zoho-enczapikey ${privateEnv.ZEPTOMAIL_TOKEN}`;
	client = new SendMailClient({ url, token });
	return client;
}

function getFrom(): { address: string; name: string } {
	return {
		address: privateEnv.ZEPTOMAIL_FROM_ADDRESS || 'noreply@openfilamentdatabase.org',
		name: privateEnv.ZEPTOMAIL_FROM_NAME || 'Open Filament Database'
	};
}

async function sendEmail(
	to: string,
	{ subject, text: textBody, html: htmlBody }: EmailContent
): Promise<void> {
	const c = getClient();
	if (!c) return;

	const from = getFrom();
	console.log(`[Email] Sending to ${to}: ${subject}`);

	try {
		await c.sendMail({
			from: { address: from.address, name: from.name },
			to: [{ email_address: { address: to } }],
			subject,
			textbody: textBody,
			htmlbody: htmlBody
		});
		console.log(`[Email] Sent successfully to ${to}`);
	} catch (err: any) {
		console.error('[Email] ZeptoMail send failed:', JSON.stringify(err, null, 2));
		throw err;
	}
}

// --- Templates ---

export interface EmailContent {
	subject: string;
	text: string;
	html: string;
}

/** The editor's primary colour (`--primary` in globals.css). */
const BRAND = '#3784e1';

const FOOTER_TEXT =
	'You received this email because you submitted changes via SimplyPrint and consented to email notifications.';

export function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function textToHtml(text: string): string {
	return escapeHtml(text).replace(/\n/g, '<br>');
}

/**
 * A button that survives email clients: a table cell with a background colour and a link
 * filling it, all inline styles (Outlook ignores most CSS on `<a>`).
 */
export function emailButton(href: string, label: string): string {
	const url = escapeHtml(href);
	return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 24px 0;">
	<tr>
		<td align="center" bgcolor="${BRAND}" style="border-radius: 8px; background-color: ${BRAND};">
			<a href="${url}" target="_blank" style="display: inline-block; padding: 13px 26px; font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 16px; font-weight: 600; line-height: 20px; color: #ffffff; text-decoration: none; border-radius: 8px;">${escapeHtml(label)}</a>
		</td>
	</tr>
</table>`;
}

/** The shared frame: a centred white card with the wordmark and the footer. */
function layout(bodyHtml: string): string {
	const font = "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
	return `<!doctype html>
<html>
<body style="margin: 0; padding: 0; background-color: #f4f5f7;">
	<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f4f5f7;">
		<tr>
			<td align="center" style="padding: 32px 16px;">
				<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 600px; background-color: #ffffff; border-radius: 10px; border: 1px solid #e3e5e8;">
					<tr>
						<td style="padding: 28px 32px 8px; font-family: ${font}; font-size: 13px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: ${BRAND};">Open Filament Database</td>
					</tr>
					<tr>
						<td style="padding: 8px 32px 28px; font-family: ${font}; font-size: 15px; line-height: 1.55; color: #1f2328;">
${bodyHtml}
						</td>
					</tr>
				</table>
				<p style="max-width: 600px; margin: 16px auto 0; font-family: ${font}; font-size: 12px; line-height: 1.5; color: #6b7280;">${escapeHtml(FOOTER_TEXT)}</p>
			</td>
		</tr>
	</table>
</body>
</html>`;
}

function heading(text: string): string {
	return `<h1 style="margin: 0 0 12px; font-size: 22px; line-height: 1.3; color: #1f2328;">${escapeHtml(text)}</h1>`;
}

function paragraph(html: string): string {
	return `<p style="margin: 0 0 12px;">${html}</p>`;
}

function secondaryLink(href: string, label: string): string {
	return paragraph(
		`<a href="${escapeHtml(href)}" target="_blank" style="color: ${BRAND}; font-size: 14px;">${escapeHtml(label)}</a>`
	);
}

/** "Night Saphire · name" for an item, "General" when it isn't about one field. */
function itemWhere(item: FeedbackItem): string {
	const loc = item.location;
	if (!loc) return 'General';
	const name = loc.entityPath?.split('/').at(-1)?.replace(/_/g, ' ') ?? loc.repoPath;
	return loc.label ? `${name} · ${loc.label}` : name;
}

function itemWho(item: FeedbackItem): string {
	return item.source === 'ai' ? 'Automated review (unverified)' : item.author;
}

export function feedbackListText(items: FeedbackItem[]): string {
	return items
		.map((item, i) => `${i + 1}. ${itemWhere(item)} (${itemWho(item)}):\n${item.body}`)
		.join('\n\n');
}

export function feedbackListHtml(items: FeedbackItem[]): string {
	const rows = items
		.map(
			(item) => `<tr>
	<td style="padding: 12px 14px; border-left: 3px solid ${item.source === 'ai' ? '#9ca3af' : '#f59e0b'}; background-color: #f8f9fa; border-radius: 4px;">
		<div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;"><strong style="color: #1f2328;">${escapeHtml(itemWhere(item))}</strong> · ${escapeHtml(itemWho(item))}</div>
		<div style="font-size: 14px; color: #1f2328;">${textToHtml(item.body)}</div>
	</td>
</tr>
<tr><td style="height: 8px; line-height: 8px; font-size: 0;">&nbsp;</td></tr>`
		)
		.join('\n');
	return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin: 8px 0 4px;">\n${rows}\n</table>`;
}

/** The main call to action: the submission page when known, otherwise the pull request. */
function action(
	submissionUrl: string | undefined,
	prUrl: string,
	label: string
): { html: string; text: string } {
	if (submissionUrl) {
		return {
			html: emailButton(submissionUrl, label) + secondaryLink(prUrl, 'See it on GitHub'),
			text: `${label}: ${submissionUrl}\nOn GitHub: ${prUrl}`
		};
	}
	return { html: emailButton(prUrl, 'See it on GitHub'), text: `On GitHub: ${prUrl}` };
}

export function mergedEmail(prNumber: number, prUrl: string, submissionUrl?: string): EmailContent {
	const cta = action(submissionUrl, prUrl, 'View your submission');
	return {
		subject: `Your filament submission has been merged!`,
		text: `Great news! Your filament database submission has been reviewed and merged.\n\nYour changes are now part of the Open Filament Database and go live with the next nightly dataset build. Thank you for contributing!\n\n${cta.text}\n\n${FOOTER_TEXT}\n`,
		html: layout(
			heading('Your submission has been merged!') +
				paragraph('Great news! Your filament database submission has been reviewed and merged.') +
				paragraph(
					'Your changes are now part of the Open Filament Database and go live with the next nightly dataset build. Thank you for contributing!'
				) +
				cta.html
		)
	};
}

export function closedEmail(prNumber: number, prUrl: string, submissionUrl?: string): EmailContent {
	const cta = action(submissionUrl, prUrl, 'View your submission');
	return {
		subject: `Your filament submission was closed`,
		text: `Your filament database submission was closed without being merged.\n\nThis may happen if the submission was a duplicate or didn't meet the database requirements. Feel free to submit again with corrections.\n\n${cta.text}\n\n${FOOTER_TEXT}\n`,
		html: layout(
			heading('Your submission was closed') +
				paragraph('Your filament database submission was closed without being merged.') +
				paragraph(
					"This may happen if the submission was a duplicate or didn't meet the database requirements. Feel free to submit again with corrections."
				) +
				cta.html
		)
	};
}

/**
 * A reviewer requested changes on an open submission (a GitHub "Request changes" review).
 * `items` is every open feedback item on the PR (feedback.ts).
 */
export function changesRequestedEmail(
	prNumber: number,
	prUrl: string,
	reviewComments?: string,
	items: FeedbackItem[] = [],
	submissionUrl?: string
): EmailContent {
	const cta = action(submissionUrl, prUrl, 'Fix it in the web editor');
	const commentsText = reviewComments ? `Reviewer comments:\n${reviewComments}\n\n` : '';
	const itemsText = items.length ? `All feedback so far:\n\n${feedbackListText(items)}\n\n` : '';
	return {
		subject: `Changes requested on your filament submission`,
		text: `A reviewer has requested changes on your filament database submission.\n\n${commentsText}${itemsText}${cta.text}\n\n${FOOTER_TEXT}\n`,
		html: layout(
			heading('Changes requested on your submission') +
				paragraph('A reviewer has requested changes on your filament database submission.') +
				(reviewComments
					? `<blockquote style="margin: 0 0 16px; padding: 10px 14px; border-left: 3px solid #f59e0b; background-color: #fffbeb; color: #1f2328;">${textToHtml(reviewComments)}</blockquote>`
					: '') +
				(items.length
					? paragraph('<strong>All feedback so far</strong>') + feedbackListHtml(items)
					: '') +
				cta.html
		)
	};
}

/** A maintainer closed the submission so the contributor can fix it and resubmit. */
export function returnedEmail(
	prNumber: number,
	prUrl: string,
	items: FeedbackItem[],
	submissionUrl?: string
): EmailContent {
	const cta = action(submissionUrl, prUrl, 'Fix it in the web editor');
	const count = `${items.length} thing${items.length === 1 ? '' : 's'}`;
	return {
		subject: `Your filament submission needs a few changes`,
		text: `A reviewer looked at your filament database submission and sent it back with ${count} to fix.\n\nFeedback:\n\n${feedbackListText(items)}\n\nYour changes load back into the editor with the feedback next to them. Then send it again.\n\n${cta.text}\n\n${FOOTER_TEXT}\n`,
		html: layout(
			heading('Your submission needs a few changes') +
				paragraph(
					`A reviewer looked at your filament database submission and sent it back with <strong>${escapeHtml(count)}</strong> to fix.`
				) +
				feedbackListHtml(items) +
				paragraph(
					'<span style="font-size: 14px; color: #4b5563;">Your changes load back into the editor with the feedback next to them. Then send it again.</span>'
				) +
				cta.html
		)
	};
}

/** A maintainer rejected the submission ("Reject: <reason>"). */
export function rejectedEmail(
	prNumber: number,
	prUrl: string,
	reason?: string,
	submissionUrl?: string
): EmailContent {
	const cta = action(submissionUrl, prUrl, 'View your submission');
	return {
		subject: `Your filament submission was not accepted`,
		text: `Your filament database submission was closed without being merged.\n\n${reason ? `Reason given by the reviewer:\n${reason}\n\n` : ''}${cta.text}\n\n${FOOTER_TEXT}\n`,
		html: layout(
			heading('Your submission was not accepted') +
				paragraph('Your filament database submission was closed without being merged.') +
				(reason
					? paragraph('<strong>Reason given by the reviewer</strong>') +
						`<blockquote style="margin: 0 0 16px; padding: 10px 14px; border-left: 3px solid #9ca3af; background-color: #f8f9fa; color: #1f2328;">${textToHtml(reason)}</blockquote>`
					: '') +
				cta.html
		)
	};
}

// --- Senders ---

export async function sendMergedEmail(
	to: string,
	prNumber: number,
	prUrl: string,
	submissionUrl?: string
): Promise<void> {
	await sendEmail(to, mergedEmail(prNumber, prUrl, submissionUrl));
}

export async function sendClosedEmail(
	to: string,
	prNumber: number,
	prUrl: string,
	submissionUrl?: string
): Promise<void> {
	await sendEmail(to, closedEmail(prNumber, prUrl, submissionUrl));
}

export async function sendChangesRequestedEmail(
	to: string,
	prNumber: number,
	prUrl: string,
	reviewComments?: string,
	items?: FeedbackItem[],
	submissionUrl?: string
): Promise<void> {
	await sendEmail(to, changesRequestedEmail(prNumber, prUrl, reviewComments, items, submissionUrl));
}

export async function sendReturnedEmail(
	to: string,
	prNumber: number,
	prUrl: string,
	items: FeedbackItem[],
	submissionUrl?: string
): Promise<void> {
	await sendEmail(to, returnedEmail(prNumber, prUrl, items, submissionUrl));
}

export async function sendRejectedEmail(
	to: string,
	prNumber: number,
	prUrl: string,
	reason?: string,
	submissionUrl?: string
): Promise<void> {
	await sendEmail(to, rejectedEmail(prNumber, prUrl, reason, submissionUrl));
}
