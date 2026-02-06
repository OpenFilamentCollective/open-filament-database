<script lang="ts">
	import type { Config } from '@sjsf/form';

	let {
		type,
		config,
		value = $bindable(),
		handlers,
		errors,
		uiOption
	}: {
		type: 'widget';
		config: Config;
		value: string | undefined;
		handlers: { onblur?: () => void; oninput?: () => void; onchange?: () => void };
		errors: string[];
		uiOption: (key: string) => any;
	} = $props();

	const inputType = $derived(uiOption('inputType') ?? 'text');
	const placeholder = $derived(uiOption('placeholder') ?? '');
	const readonly = $derived(uiOption('readonly') ?? false);
	const disabled = $derived(uiOption('disabled') ?? false);
</script>

<input
	id={config.path.id}
	type={inputType}
	class="w-full px-3 py-2 bg-background border border-input rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
	class:border-destructive={errors.length > 0}
	bind:value
	{placeholder}
	{readonly}
	{disabled}
	onblur={handlers.onblur}
	oninput={handlers.oninput}
	onchange={handlers.onchange}
/>
