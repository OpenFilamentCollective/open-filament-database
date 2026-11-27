#!/usr/bin/env node
// Start the fake GitHub/SimplyPrint backend and the web editor (vite dev, cloud mode) wired to it.
//
//   node scripts/fake-github/dev.mjs --work <dir> [--dataset-dir <ofd build output>]
//
// <dir> gets an isolated .env (OFD_ENV_DIR), so webui/.env and its real credentials are never
// loaded. Ctrl-C stops both processes.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEBUI = path.resolve(HERE, '../..');
const argv = process.argv.slice(2);
const arg = (k, d) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d);
const WORK = path.resolve(arg('work', path.join(WEBUI, '.fake-github')));
const DATASET = arg('dataset-dir', null);
const FAKE = `http://localhost:${arg('fake-port', '4010')}`;
const APP_PORT = arg('app-port', '5173');
const APP = `http://localhost:${APP_PORT}`;

fs.mkdirSync(WORK, { recursive: true });
const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const pem = privateKey.export({ type: 'pkcs1', format: 'pem' }).toString();

const vars = {
	PUBLIC_APP_MODE: 'cloud',
	PUBLIC_DEBUG: 'false',
	PUBLIC_API_BASE_URL: DATASET ? `${FAKE}/dataset` : 'https://api.openfilamentdatabase.org',
	PUBLIC_CACHE_ENABLED: 'false',
	ORIGIN: APP,
	PUBLIC_GITHUB_CLIENT_ID: 'fake-gh-client',
	GITHUB_CLIENT_SECRET: 'fake-gh-secret',
	GITHUB_REDIRECT_URI: `${APP}/api/auth/github/callback`,
	GITHUB_UPSTREAM_OWNER: 'OpenFilamentCollective',
	GITHUB_UPSTREAM_REPO: 'open-filament-database',
	GITHUB_API_URL: FAKE,
	GITHUB_WEB_URL: FAKE,
	PUBLIC_SIMPLYPRINT_CLIENT_ID: 'fake-sp-client',
	SIMPLYPRINT_CLIENT_SECRET: 'fake-sp-secret',
	SIMPLYPRINT_REDIRECT_URI: `${APP}/api/auth/simplyprint/callback`,
	SIMPLYPRINT_BASE_URL: FAKE,
	SIMPLYPRINT_API_URL: `${FAKE}/api`,
	ANON_BOT_ENABLED: 'true',
	GITHUB_APP_ID: '424242',
	GITHUB_APP_PRIVATE_KEY: pem.replace(/\n/g, '\\n'),
	GITHUB_APP_INSTALLATION_ID: '777',
	GITHUB_WEBHOOK_SECRET: 'fake-webhook-secret',
	OFD_CLOSE_SETTLE_MS: '300',
	OFD_WEBUI_URL: APP,
	DATABASE_URL: '',
	DATABASE_SSL: 'false',
	ZEPTOMAIL_TOKEN: '',
	ZEPTOMAIL_API_URL: '',
	EMAIL_OUTBOX_URL: `${FAKE}/__outbox/email`,
	WEBHOOK_URL_SUBMITTED: `${FAKE}/__outbox/webhook/submitted`,
	WEBHOOK_URL_MERGED: `${FAKE}/__outbox/webhook/merged`,
	WEBHOOK_URL_CLOSED: `${FAKE}/__outbox/webhook/closed`,
	WEBHOOK_URL_CHANGES_REQUESTED: `${FAKE}/__outbox/webhook/changes_requested`,
	WEBHOOK_SECRET: 'fake-ofd-webhook-secret',
	ANON_RATE_LIMIT_PER_HOUR: '1000',
	PUBLIC_WRAPPER_NAME: '',
	WEBUI_DEV_HOST: 'localhost',
	WEBUI_DEV_PORT: APP_PORT
};
fs.writeFileSync(
	path.join(WORK, '.env'),
	Object.entries(vars)
		.map(([k, v]) => `${k}=${v.includes('\\n') ? `"${v}"` : v}`)
		.join('\n') + '\n'
);
// Same values in the process env, which takes priority over any .env file.
const env = { ...process.env, ...vars, OFD_ENV_DIR: WORK };

const procs = [];
const run = (name, cmd, args) => {
	const p = spawn(cmd, args, { cwd: WEBUI, env, stdio: ['ignore', 'pipe', 'pipe'] });
	for (const s of [p.stdout, p.stderr]) s.on('data', (d) => process.stdout.write(d.toString().replace(/^(?=.)/gm, `[${name}] `)));
	p.on('exit', (code) => {
		console.log(`[${name}] exited ${code}`);
		for (const q of procs) q.kill();
		process.exit(code ?? 1);
	});
	procs.push(p);
};
process.on('SIGINT', () => procs.forEach((p) => p.kill()));
process.on('SIGTERM', () => procs.forEach((p) => p.kill()));

run('fake', process.execPath, [path.join(HERE, 'server.js'), '--port', new URL(FAKE).port, ...(DATASET ? ['--dataset-dir', DATASET] : [])]);
run('app', path.join(WEBUI, 'node_modules/.bin/vite'), ['dev', '--port', APP_PORT, '--strictPort']);
console.log(`[dev] isolated env: ${path.join(WORK, '.env')}\n[dev] app ${APP}  ·  fake GitHub ${FAKE}`);
