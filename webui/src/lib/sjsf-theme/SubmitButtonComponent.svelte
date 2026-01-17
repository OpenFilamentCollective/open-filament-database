<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Config } from '@sjsf/form';

	let {
		config,
		children
	}: {
		config: Config;
		children: Snippet;
	} = $props();

	// Check if submit button should be hidden via uiSchema
	const uiOptions = config.uiSchema?.['ui:options'] as Record<string, any> | undefined;
	const submitButtonOptions = uiOptions?.submitButton as Record<string, any> | undefined;
	const isHidden = submitButtonOptions?.class?.includes('hidden') || submitButtonOptions?.hidden;
</script>

{#if !isHidden}
	<button
		type="submit"
		class="w-full px-6 py-3 bg-primary text-primary-foreground hover:bg-primary/90 rounded-md font-medium transition-colors"
	>
		{@render children()}
	</button>
{/if}
