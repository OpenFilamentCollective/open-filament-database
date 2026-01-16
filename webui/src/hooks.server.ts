import { existsSync } from 'fs';
import { join } from 'path';
import { env } from '$env/dynamic/public';

// Check for .env file on server startup
const envPath = join(process.cwd(), '.env');

if (!existsSync(envPath)) {
	console.error('\n' + '='.repeat(60));
	console.error('ERROR: Missing .env file');
	console.error('='.repeat(60));
	console.error('\nPlease create a .env file in the webui directory.');
	console.error('You can copy the example file:');
	console.error('\n  cp .env.example .env\n');
	console.error('Required environment variables:');
	console.error('  - PUBLIC_APP_MODE (local or cloud)');
	console.error('  - PUBLIC_API_BASE_URL (for cloud mode)');
	console.error('\n' + '='.repeat(60) + '\n');
	throw new Error('Missing .env file. Please create one from .env.example');
}

// Validate required environment variables
if (!env.PUBLIC_APP_MODE) {
	console.error('\n' + '='.repeat(60));
	console.error('ERROR: Missing required environment variable');
	console.error('='.repeat(60));
	console.error('\nPUBLIC_APP_MODE is not set in your .env file.');
	console.error('Valid values: "local" or "cloud"');
	console.error('\n' + '='.repeat(60) + '\n');
	throw new Error('Missing required environment variable: PUBLIC_APP_MODE');
}

if (env.PUBLIC_APP_MODE !== 'local' && env.PUBLIC_APP_MODE !== 'cloud') {
	console.error('\n' + '='.repeat(60));
	console.error('ERROR: Invalid PUBLIC_APP_MODE value');
	console.error('='.repeat(60));
	console.error(`\nPUBLIC_APP_MODE is set to "${env.PUBLIC_APP_MODE}"`);
	console.error('Valid values: "local" or "cloud"');
	console.error('\n' + '='.repeat(60) + '\n');
	throw new Error('Invalid PUBLIC_APP_MODE. Must be "local" or "cloud"');
}

if (env.PUBLIC_APP_MODE === 'cloud' && !env.PUBLIC_API_BASE_URL) {
	console.error('\n' + '='.repeat(60));
	console.error('ERROR: Missing required environment variable for cloud mode');
	console.error('='.repeat(60));
	console.error('\nPUBLIC_API_BASE_URL is required when PUBLIC_APP_MODE is "cloud"');
	console.error('\n' + '='.repeat(60) + '\n');
	throw new Error('Missing required environment variable: PUBLIC_API_BASE_URL (required for cloud mode)');
}

console.log(`[env] App mode: ${env.PUBLIC_APP_MODE}`);
if (env.PUBLIC_API_BASE_URL) {
	console.log(`[env] API base URL: ${env.PUBLIC_API_BASE_URL}`);
}
