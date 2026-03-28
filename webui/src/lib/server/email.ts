/**
 * ZeptoMail email notifications for PR lifecycle events.
 * Sends notifications to submitters when their PRs are merged, closed, or need changes.
 */
import { SendMailClient } from 'zeptomail';
import { env as privateEnv } from '$env/dynamic/private';

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

async function sendEmail(to: string, subject: string, textBody: string, htmlBody: string): Promise<void> {
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

export async function sendMergedEmail(to: string, prNumber: number, prUrl: string): Promise<void> {
	await sendEmail(
		to,
		`Your filament submission (PR #${prNumber}) has been merged!`,
		`Great news! Your filament database submission has been reviewed and merged.\n\nPull Request: ${prUrl}\n\nYour changes are now part of the Open Filament Database. Thank you for contributing!\n\nYou received this email because you submitted changes via SimplyPrint and consented to email notifications.\n`,
		`
			<h2>Your submission has been merged!</h2>
			<p>Great news! Your filament database submission has been reviewed and merged.</p>
			<p><a href="${prUrl}">View Pull Request #${prNumber}</a></p>
			<p>Your changes are now part of the Open Filament Database. Thank you for contributing!</p>
			<hr>
			<p style="color: #666; font-size: 12px;">You received this email because you submitted changes via SimplyPrint and consented to email notifications.</p>
		`
	);
}

export async function sendClosedEmail(to: string, prNumber: number, prUrl: string): Promise<void> {
	await sendEmail(
		to,
		`Your filament submission (PR #${prNumber}) was closed`,
		`Your filament database submission was closed without being merged.\n\nPull Request: ${prUrl}\n\nThis may happen if the submission was a duplicate or didn't meet the database requirements. Feel free to submit again with corrections.\n\nYou received this email because you submitted changes via SimplyPrint and consented to email notifications.\n`,
		`
			<h2>Your submission was closed</h2>
			<p>Your filament database submission was closed without being merged.</p>
			<p><a href="${prUrl}">View Pull Request #${prNumber}</a></p>
			<p>This may happen if the submission was a duplicate or didn't meet the database requirements. Feel free to submit again with corrections.</p>
			<hr>
			<p style="color: #666; font-size: 12px;">You received this email because you submitted changes via SimplyPrint and consented to email notifications.</p>
		`
	);
}

export async function sendChangesRequestedEmail(
	to: string,
	prNumber: number,
	prUrl: string,
	reviewComments?: string
): Promise<void> {
	const commentsSection = reviewComments
		? `\n\nReviewer comments:\n${reviewComments}\n`
		: '';
	const commentsHtml = reviewComments
		? `<h3>Reviewer comments:</h3><blockquote>${reviewComments.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/\n/g, '<br>')}</blockquote>`
		: '';

	await sendEmail(
		to,
		`Changes requested on your filament submission (PR #${prNumber})`,
		`A reviewer has requested changes on your filament database submission.\n\nPull Request: ${prUrl}${commentsSection}\nPlease review the feedback and consider resubmitting with the suggested changes.\n\nYou received this email because you submitted changes via SimplyPrint and consented to email notifications.\n`,
		`
			<h2>Changes requested on your submission</h2>
			<p>A reviewer has requested changes on your filament database submission.</p>
			<p><a href="${prUrl}">View Pull Request #${prNumber}</a></p>
			${commentsHtml}
			<p>Please review the feedback and consider resubmitting with the suggested changes.</p>
			<hr>
			<p style="color: #666; font-size: 12px;">You received this email because you submitted changes via SimplyPrint and consented to email notifications.</p>
		`
	);
}
