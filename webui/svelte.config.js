import adapterAuto from '@sveltejs/adapter-auto';
import adapterNode from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const isDocker = process.env.DOCKER_BUILD === 'true';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://svelte.dev/docs/kit/integrations
	// for more information about preprocessors
	preprocess: vitePreprocess(),

	kit: {
		adapter: isDocker ? adapterNode() : adapterAuto(),
		// OFD_ENV_DIR lets scripts/fake-github/dev.mjs load an isolated .env, so a test
		// run never picks up the real credentials in webui/.env.
		env: { dir: process.env.OFD_ENV_DIR || '.' }
	}
};

export default config;
