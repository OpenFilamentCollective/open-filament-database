<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Config } from '@sjsf/form';

	let {
		type,
		config,
		errors,
		disabled,
		onclick,
		children
	}: {
		type: string;
		config: Config;
		errors: string[];
		disabled: boolean;
		onclick: () => void;
		children: Snippet;
	} = $props();

	// Map button types to CSS classes
	const buttonClasses: Record<string, string> = {
		'array-item-add': 'px-3 py-1.5 text-sm bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-md transition-colors',
		'array-item-remove': 'px-2 py-1 text-sm bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-md transition-colors',
		'array-item-move-up': 'px-2 py-1 text-sm bg-muted text-muted-foreground hover:bg-muted/80 rounded-md transition-colors',
		'array-item-move-down': 'px-2 py-1 text-sm bg-muted text-muted-foreground hover:bg-muted/80 rounded-md transition-colors',
		'array-item-copy': 'px-2 py-1 text-sm bg-muted text-muted-foreground hover:bg-muted/80 rounded-md transition-colors',
		'object-property-add': 'px-3 py-1.5 text-sm bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-md transition-colors',
		'object-property-remove': 'px-2 py-1 text-sm bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-md transition-colors'
	};

	const defaultClass = 'px-3 py-1.5 text-sm bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-md transition-colors disabled:opacity-50';
</script>

<button
	type="button"
	class="{buttonClasses[type] ?? defaultClass} {disabled ? 'opacity-50 cursor-not-allowed' : ''}"
	{disabled}
	{onclick}
>
	{@render children()}
</button>
