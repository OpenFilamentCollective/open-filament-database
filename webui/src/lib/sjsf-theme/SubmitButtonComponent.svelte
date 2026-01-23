<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Config } from '@sjsf/form';
	import { Button } from '$lib/components/ui';

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
	<Button type="submit" variant="primary" class="w-full px-6 py-3">
		{@render children()}
	</Button>
{/if}
