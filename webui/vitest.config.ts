import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	plugins: [sveltekit()],
	test: {
		include: ['src/**/*.{test,spec}.{js,ts}'],
		globals: true,
		environment: 'jsdom',
		setupFiles: ['./src/tests/setup.ts'],
		alias: {
			$lib: new URL('./src/lib', import.meta.url).pathname,
			'$app/environment': new URL('./src/tests/mocks/app/environment.ts', import.meta.url)
				.pathname,
			'$app/navigation': new URL('./src/tests/mocks/app/navigation.ts', import.meta.url).pathname,
			'$env/dynamic/public': new URL('./src/tests/mocks/env/dynamic-public.ts', import.meta.url)
				.pathname,
			'$env/dynamic/private': new URL('./src/tests/mocks/env/dynamic-private.ts', import.meta.url)
				.pathname
		},
		coverage: {
			provider: 'v8',
			reporter: ['text', 'json', 'html'],
			include: ['src/lib/**/*.ts', 'src/routes/**/*.ts'],
			exclude: ['src/tests/**', '**/*.test.ts', '**/*.spec.ts']
		}
	}
});
