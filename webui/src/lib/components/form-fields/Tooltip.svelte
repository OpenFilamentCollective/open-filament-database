<script lang="ts">
	interface Props {
		text: string;
	}

	let { text }: Props = $props();
	let active = $state(false);
</script>

<button
	type="button"
	class="inline-flex items-center justify-center w-4 h-4 ml-1 text-muted-foreground hover:text-foreground transition-colors relative"
	onmouseenter={() => (active = true)}
	onmouseleave={() => (active = false)}
	onfocus={() => (active = true)}
	onblur={() => (active = false)}
>
	<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
		<path
			fill-rule="evenodd"
			d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM8.94 6.94a.75.75 0 11-1.061-1.061 3 3 0 112.871 5.026v.345a.75.75 0 01-1.5 0v-.5c0-.72.57-1.172 1.081-1.287A1.5 1.5 0 108.94 6.94zM10 15a1 1 0 100-2 1 1 0 000 2z"
			clip-rule="evenodd"
		/>
	</svg>
	{#if active}
		<div
			class="absolute left-6 top-0 z-50 w-64 p-2 text-xs text-left bg-popover text-popover-foreground border border-border rounded-lg shadow-lg"
		>
			{text}
			<div
				class="absolute left-0 top-2 -translate-x-1 w-2 h-2 bg-popover border-l border-b border-border rotate-45"
			></div>
		</div>
	{/if}
</button>
