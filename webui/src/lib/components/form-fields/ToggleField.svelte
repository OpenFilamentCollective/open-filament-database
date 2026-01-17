<script lang="ts">
	interface Props {
		checked: boolean;
		label: string;
		tooltip?: string;
		onchange?: () => void;
	}

	let { checked = $bindable(false), label, tooltip = '', onchange }: Props = $props();
</script>

<label class="inline-flex items-center cursor-pointer group relative">
	<input
		type="checkbox"
		bind:checked
		{onchange}
		class="sr-only peer"
	/>
	<div
		class="relative w-11 h-6 bg-input peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-ring rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-primary-foreground after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-background after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary peer-checked:after:bg-primary-foreground"
	></div>
	<span class="ms-2 text-sm font-medium text-foreground">{label}</span>
	{#if tooltip}
		<div
			class="invisible group-hover:visible absolute left-0 top-8 z-50 w-56 p-2 text-xs bg-popover text-popover-foreground border border-border rounded-lg shadow-lg"
		>
			{tooltip}
		</div>
	{/if}
</label>
