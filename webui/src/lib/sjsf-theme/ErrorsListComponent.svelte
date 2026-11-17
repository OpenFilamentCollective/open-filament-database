<script lang="ts">
	import type { Config } from '@sjsf/form';

	let {
		errors,
		config
	}: {
		errors: string[];
		config: Config;
	} = $props();
</script>

{#if errors.length > 0}
	<ul class="text-sm text-destructive space-y-1">
		{#each errors as error}
			<li>{error}</li>
		{/each}
	</ul>
{/if}
