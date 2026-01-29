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
		value: boolean | undefined;
		handlers: { onblur?: () => void; oninput?: () => void; onchange?: () => void };
		errors: string[];
		uiOption: (key: string) => any;
	} = $props();

	const disabled = $derived(uiOption('disabled') ?? false);
</script>

<input
	id={config.path.id}
	type="checkbox"
	class="h-4 w-4 rounded border-border bg-background text-primary focus:ring-ring focus:ring-2 focus:ring-offset-0 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
	class:border-destructive={errors.length > 0}
	bind:checked={value}
	{disabled}
	onblur={handlers.onblur}
	onchange={handlers.onchange}
/>
