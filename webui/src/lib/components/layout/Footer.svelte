<script lang="ts">
	import { env } from '$env/dynamic/public';
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import { isCloudMode, apiBaseUrl } from '$lib/stores/environment';

	let commit: string | null = $state(null);

	onMount(async () => {
		if (!get(isCloudMode)) return;
		try {
			const res = await fetch(`${get(apiBaseUrl)}/api/v1/index.json`);
			if (res.ok) {
				const data = await res.json();
				if (data.commit) commit = data.commit;
			}
		} catch {
			// silently ignore
		}
	});
</script>

<footer class="border-t bg-background">
	<div class="container mx-auto flex flex-col items-center justify-between gap-4 px-6 py-6 sm:flex-row">
		<p class="text-sm text-muted-foreground">
			&copy; {new Date().getFullYear()} Open Filament Collective. Open source under MIT.
			Facilitated by
			<a
				href="https://simplyprint.io"
				target="_blank"
				rel="noopener noreferrer"
				class="text-primary hover:underline"
			>SimplyPrint</a>.
		</p>
		<nav class="flex items-center gap-4 text-sm text-muted-foreground">
			<a
				href="https://github.com/OpenFilamentCollective/open-filament-database"
				target="_blank"
				rel="noopener noreferrer"
				class="transition-colors hover:text-foreground"
			>
				GitHub
			</a>
			{#if env.PUBLIC_API_BASE_URL}
				<a
					href={env.PUBLIC_API_BASE_URL}
					target="_blank"
					rel="noopener noreferrer"
					class="transition-colors hover:text-foreground"
				>
					API
				</a>
			{/if}
			<a
				href="https://github.com/OpenFilamentCollective/open-filament-database/issues"
				target="_blank"
				rel="noopener noreferrer"
				class="transition-colors hover:text-foreground"
			>
				Report an Issue
			</a>
			{#if commit}
				<a
					href="https://github.com/OpenFilamentCollective/open-filament-database/commit/{commit}"
					target="_blank"
					rel="noopener noreferrer"
					class="font-mono transition-colors hover:text-foreground"
					title="Database build commit"
				>
					{commit.slice(0, 7)}
				</a>
			{/if}
		</nav>
	</div>
</footer>
