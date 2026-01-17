<script lang="ts">
	import type { Config } from '@sjsf/form';

	let {
		type,
		config,
		value = $bindable(),
		handlers,
		errors,
		uiOption,
		options
	}: {
		type: 'widget';
		config: Config;
		value: any;
		handlers: { onblur?: () => void; oninput?: () => void; onchange?: () => void };
		errors: string[];
		uiOption: (key: string) => any;
		options: { value: any; label: string }[];
	} = $props();

	const disabled = $derived(uiOption('disabled') ?? false);
</script>

<select
	id={config.path.id}
	class="w-full px-3 py-2 bg-background border border-input rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
	class:border-destructive={errors.length > 0}
	bind:value
	{disabled}
	onblur={handlers.onblur}
	onchange={handlers.onchange}
>
	{#each options as option}
		<option value={option.value}>{option.label}</option>
	{/each}
</select>
