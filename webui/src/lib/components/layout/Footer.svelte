<script lang="ts">
	import { env } from '$env/dynamic/public';
</script>

<footer class="border-t bg-background">
	<div class="container mx-auto flex flex-col items-center justify-between gap-4 px-6 py-6 sm:flex-row">
		<p class="text-sm text-muted-foreground">
			&copy; {new Date().getFullYear()} Open Filament Collective. Open source under MIT.
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
		</nav>
	</div>
</footer>
