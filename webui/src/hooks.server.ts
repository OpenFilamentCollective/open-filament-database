import { copyFileSync, existsSync } from 'fs';
import { join } from 'path';
import { env } from '$env/dynamic/public';

// In cloud mode, env vars come from the platform — skip .env file management.
// Use process.env directly since it's available before SvelteKit processes .env files.
if (process.env.PUBLIC_APP_MODE !== 'cloud') {
	// Check for .env file on server startup — auto-create from .env.example if missing
	const envPath = join(process.cwd(), '.env');
	const envExamplePath = join(process.cwd(), '.env.example');

	if (!existsSync(envPath)) {
		if (existsSync(envExamplePath)) {
			copyFileSync(envExamplePath, envPath);
			console.log('\n' + '='.repeat(60));
			console.log('[env] .env file was missing — copied from .env.example');
			console.log('[env] Restarting server to load new environment variables...');
			console.log('='.repeat(60) + '\n');
			process.exit(0);
		} else {
			console.error('\n' + '='.repeat(60));
			console.error('ERROR: Missing .env file and no .env.example found');
			console.error('='.repeat(60) + '\n');
			throw new Error('Missing .env file and no .env.example to copy from');
		}
	}
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
