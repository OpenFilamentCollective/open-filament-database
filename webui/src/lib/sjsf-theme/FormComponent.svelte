<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLFormAttributes } from 'svelte/elements';
	import type { Config } from '@sjsf/form';
	import { handlers, getFormContext } from '@sjsf/form';

	let {
		ref = $bindable(),
		config,
		children,
		attributes
	}: {
		ref?: HTMLFormElement | undefined;
		config: Config;
		children: Snippet;
		attributes?: HTMLFormAttributes | undefined;
	} = $props();

	const ctx = getFormContext();
	const formHandlers = handlers(ctx);
</script>

<form bind:this={ref} use:formHandlers {...attributes} class="space-y-4">
	{@render children()}
</form>
