import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';
import { existsSync, copyFileSync } from 'fs';
import { resolve } from 'path';

// If .env doesn't exist, fall back to .env.example (skip in Docker builds)
const envPath = resolve(__dirname, '.env');
const examplePath = resolve(__dirname, '.env.example');
if (!process.env.DOCKER_BUILD && !existsSync(envPath) && existsSync(examplePath)) {
	copyFileSync(examplePath, envPath);
	console.log('No .env found — copied .env.example to .env');
}

// The dev server stays on localhost:5173 by default: it serves the file-writing
// /api/save endpoint, so binding every interface would expose a checkout to the LAN.
// Setups that need it reachable from elsewhere opt in through .env. SimplyPrint's PHP
// container, for one, asks this server whether a contribution's pull request is still
// open, and a loopback-only bind is unreachable from inside Docker - which fails open,
// so every merged contribution stays layered forever with nothing reporting why.
export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, __dirname, 'WEBUI_DEV_');
	return {
		plugins: [tailwindcss(), sveltekit()],
		server: {
			port: Number(env.WEBUI_DEV_PORT) || 5173,
			host: env.WEBUI_DEV_HOST || 'localhost'
		}
	};
});
