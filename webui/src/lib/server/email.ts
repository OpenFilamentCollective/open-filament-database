/**
 * Email notification service for anonymous submissions.
 * Uses nodemailer with SMTP. Silently no-ops if SMTP is not configured.
 * All sends are fire-and-forget with retry logic.
 */
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
	if (transporter) return transporter;
	if (!privateEnv.SMTP_HOST) return null;

	transporter = nodemailer.createTransport({
		host: privateEnv.SMTP_HOST,
		port: Number(privateEnv.SMTP_PORT) || 587,
		secure: Number(privateEnv.SMTP_PORT) === 465,
		auth:
			privateEnv.SMTP_USER
				? {
						user: privateEnv.SMTP_USER,
						pass: privateEnv.SMTP_PASS
					}
				: undefined
	});

	return transporter;
}

function getSiteUrl(): string {
	return (publicEnv.PUBLIC_SITE_URL || '').replace(/\/$/, '');
}

function getFrom(): string {
	return privateEnv.SMTP_FROM || 'noreply@openfilamentdatabase.org';
}

async function sendEmail(to: string, subject: string, text: string): Promise<void> {
	const transport = getTransporter();
	if (!transport) return;

	for (let attempt = 0; attempt < 3; attempt++) {
		try {
			await transport.sendMail({
				from: getFrom(),
				to,
				subject,
				text
			});
			return;
		} catch (err: any) {
			console.warn(`Email send attempt ${attempt + 1} failed:`, err.message);
		}
		if (attempt < 2) await new Promise((r) => setTimeout(r, (attempt + 1) * 1000));
	}
	console.error(`Email to ${to} failed after 3 attempts`);
}

export function sendMergedEmail(email: string, uuid: string): void {
	const subject = 'Your OFD submission has been approved!';
	const text = `Hi there,

Great news -- your submission to the Open Filament Database has been reviewed, approved, and merged. Your changes are now live!

Submission reference: ${uuid}

Thank you for contributing to the community.

-- Open Filament Database`;

	sendEmail(email, subject, text).catch(() => {});
}

export function sendChangesRequestedEmail(
	email: string,
	uuid: string,
	reviewComments?: string
): void {
	const siteUrl = getSiteUrl();
	const deflateLink = siteUrl ? `${siteUrl}/deflate/${uuid}` : '';

	let text = `Hi there,

A reviewer has requested changes on your submission to the Open Filament Database.
`;

	if (reviewComments) {
		text += `
Reviewer feedback:
${reviewComments}
`;
	}

	if (deflateLink) {
		text += `
To edit and resubmit your changes, click the link below:
${deflateLink}

This link will open the editor with your original changes loaded, ready for you to make the requested adjustments.
`;
	}

	text += `
Submission reference: ${uuid}

-- Open Filament Database`;

	sendEmail(email, 'Changes requested on your OFD submission', text).catch(() => {});
}

export function sendClosedEmail(email: string, uuid: string): void {
	const subject = 'Your OFD submission was closed';
	const text = `Hi there,

Your submission to the Open Filament Database has been closed without being merged.

This may happen if the changes were superseded, duplicated, or didn't meet the project's requirements. If you believe this was a mistake, feel free to submit again.

Submission reference: ${uuid}

-- Open Filament Database`;

	sendEmail(email, subject, text).catch(() => {});
}
