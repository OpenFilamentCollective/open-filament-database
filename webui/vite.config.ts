import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { existsSync, copyFileSync } from 'fs';
import { resolve } from 'path';

// If .env doesn't exist, fall back to .env.example
const envPath = resolve(__dirname, '.env');
const examplePath = resolve(__dirname, '.env.example');
if (!existsSync(envPath) && existsSync(examplePath)) {
	copyFileSync(examplePath, envPath);
	console.log('No .env found — copied .env.example to .env');
}

export default defineConfig({ plugins: [tailwindcss(), sveltekit()] });
