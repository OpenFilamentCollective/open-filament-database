/**
 * SMTP email notifications for PR lifecycle events.
 * Sends notifications to submitters when their PRs are merged, closed, or need changes.
 */
import nodemailer from 'nodemailer';
import { env as privateEnv } from '$env/dynamic/private';

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
	if (transporter) return transporter;
	if (!privateEnv.SMTP_HOST || !privateEnv.SMTP_USER || !privateEnv.SMTP_PASS) {
		console.warn('[Email] SMTP not configured — missing SMTP_HOST, SMTP_USER, or SMTP_PASS');
		return null;
	}

	transporter = nodemailer.createTransport({
		host: privateEnv.SMTP_HOST,
		port: Number(privateEnv.SMTP_PORT) || 587,
		secure: privateEnv.SMTP_SECURE === 'true',
		auth: {
			user: privateEnv.SMTP_USER,
			pass: privateEnv.SMTP_PASS
		}
	});

	return transporter;
}

function getFromAddress(): string {
	return privateEnv.SMTP_FROM || `OFD Notifications <${privateEnv.SMTP_USER}>`;
}

export async function sendMergedEmail(to: string, prNumber: number, prUrl: string): Promise<void> {
	const t = getTransporter();
	if (!t) return;

	await t.sendMail({
		from: getFromAddress(),
		to,
		subject: `Your filament submission (PR #${prNumber}) has been merged!`,
		text: `Great news! Your filament database submission has been reviewed and merged.\n\nPull Request: ${prUrl}\n\nYour changes are now part of the Open Filament Database. Thank you for contributing!\n\nYou received this email because you submitted changes via SimplyPrint and consented to email notifications.\n`,
		html: `
			<h2>Your submission has been merged!</h2>
			<p>Great news! Your filament database submission has been reviewed and merged.</p>
			<p><a href="${prUrl}">View Pull Request #${prNumber}</a></p>
			<p>Your changes are now part of the Open Filament Database. Thank you for contributing!</p>
			<hr>
			<p style="color: #666; font-size: 12px;">You received this email because you submitted changes via SimplyPrint and consented to email notifications.</p>
		`
	});
}

export async function sendClosedEmail(to: string, prNumber: number, prUrl: string): Promise<void> {
	const t = getTransporter();
	if (!t) return;

	await t.sendMail({
		from: getFromAddress(),
		to,
		subject: `Your filament submission (PR #${prNumber}) was closed`,
		text: `Your filament database submission was closed without being merged.\n\nPull Request: ${prUrl}\n\nThis may happen if the submission was a duplicate or didn't meet the database requirements. Feel free to submit again with corrections.\n\nYou received this email because you submitted changes via SimplyPrint and consented to email notifications.\n`,
		html: `
			<h2>Your submission was closed</h2>
			<p>Your filament database submission was closed without being merged.</p>
			<p><a href="${prUrl}">View Pull Request #${prNumber}</a></p>
			<p>This may happen if the submission was a duplicate or didn't meet the database requirements. Feel free to submit again with corrections.</p>
			<hr>
			<p style="color: #666; font-size: 12px;">You received this email because you submitted changes via SimplyPrint and consented to email notifications.</p>
		`
	});
}

export async function sendChangesRequestedEmail(
	to: string,
	prNumber: number,
	prUrl: string,
	reviewComments?: string
): Promise<void> {
	const t = getTransporter();
	if (!t) return;

	const commentsSection = reviewComments
		? `\n\nReviewer comments:\n${reviewComments}\n`
		: '';
	const commentsHtml = reviewComments
		? `<h3>Reviewer comments:</h3><blockquote>${reviewComments.replace(/\n/g, '<br>')}</blockquote>`
		: '';

	await t.sendMail({
		from: getFromAddress(),
		to,
		subject: `Changes requested on your filament submission (PR #${prNumber})`,
		text: `A reviewer has requested changes on your filament database submission.\n\nPull Request: ${prUrl}${commentsSection}\nPlease review the feedback and consider resubmitting with the suggested changes.\n\nYou received this email because you submitted changes via SimplyPrint and consented to email notifications.\n`,
		html: `
			<h2>Changes requested on your submission</h2>
			<p>A reviewer has requested changes on your filament database submission.</p>
			<p><a href="${prUrl}">View Pull Request #${prNumber}</a></p>
			${commentsHtml}
			<p>Please review the feedback and consider resubmitting with the suggested changes.</p>
			<hr>
			<p style="color: #666; font-size: 12px;">You received this email because you submitted changes via SimplyPrint and consented to email notifications.</p>
		`
	});
}
