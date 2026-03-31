import 'dotenv/config';
import { SendMailClient } from 'zeptomail';

const token = process.env.ZEPTOMAIL_TOKEN;
const apiUrl = process.env.ZEPTOMAIL_API_URL || 'api.zeptomail.eu/';
const fromAddress = process.env.ZEPTOMAIL_FROM_ADDRESS || 'noreply@openfilamentdatabase.org';
const fromName = process.env.ZEPTOMAIL_FROM_NAME || 'Open Filament Database';

console.log('=== ZeptoMail Test ===');
console.log('API URL:', apiUrl);
console.log('From:', `${fromName} <${fromAddress}>`);
console.log('Token (first 20 chars):', token?.substring(0, 20) + '...');
console.log('Token length:', token?.length);
console.log('');

if (!token) {
	console.error('ZEPTOMAIL_TOKEN is not set!');
	process.exit(1);
}

const fullToken = token.startsWith('Zoho-enczapikey ') ? token : `Zoho-enczapikey ${token}`;
const client = new SendMailClient({ url: apiUrl, token: fullToken });

try {
	const result = await client.sendMail({
		from: { address: fromAddress, name: fromName },
		to: [{ email_address: { address: 'frida.rosenaa@simplyprint.io', name: 'Frida' } }],
		subject: 'ZeptoMail Test from local script',
		textbody: 'This is a test email sent from the local test script.',
		htmlbody: '<div><b>ZeptoMail test email sent successfully from local script.</b></div>'
	});
	console.log('SUCCESS! Response:', JSON.stringify(result, null, 2));
} catch (err) {
	console.error('FAILED:', JSON.stringify(err, null, 2));
	process.exit(1);
}
