<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Config } from '@sjsf/form';

	let {
		type,
		config,
		errors,
		children
	}: {
		type: string;
		config: Config;
		errors: string[];
		children: Snippet;
	} = $props();

	// Map layout types to CSS classes
	const layoutClasses: Record<string, string> = {
		// Field layouts
		'field': 'space-y-2',
		'field-meta': 'space-y-1',
		'field-title-row': 'flex items-center justify-between',
		'field-content': '',

		// Object layouts
		'object-field': 'space-y-4',
		'object-field-meta': 'space-y-1',
		'object-field-title-row': 'flex items-center justify-between',
		'object-properties': 'space-y-4 pl-4 border-l-2 border-muted',
		'object-property': 'space-y-2',
		'object-property-content': '',
		'object-property-controls': 'flex gap-2',
		'object-property-key-input': '',

		// Array layouts
		'array-field': 'space-y-4',
		'array-field-meta': 'space-y-1',
		'array-field-title-row': 'flex items-center justify-between',
		'array-items': 'space-y-3',
		'array-item': 'flex gap-2 items-start p-3 bg-muted/50 rounded-md',
		'array-item-content': 'flex-1',
		'array-item-controls': 'flex gap-1 flex-shrink-0',

		// Multi-field layouts
		'multi-field': 'space-y-2',
		'multi-field-controls': 'flex gap-2',
		'multi-field-content': ''
	};
</script>

<div class={layoutClasses[type] ?? ''}>
	{@render children()}
</div>
