<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Config } from '@sjsf/form';
	import { Button } from '$lib/components/ui';

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

	// Map button types to variants and sizes
	type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'ghost';

	const buttonConfig: Record<string, { variant: ButtonVariant; size: 'sm' | 'md' }> = {
		'array-item-add': { variant: 'secondary', size: 'sm' },
		'array-item-remove': { variant: 'destructive', size: 'sm' },
		'array-item-move-up': { variant: 'ghost', size: 'sm' },
		'array-item-move-down': { variant: 'ghost', size: 'sm' },
		'array-item-copy': { variant: 'ghost', size: 'sm' },
		'object-property-add': { variant: 'secondary', size: 'sm' },
		'object-property-remove': { variant: 'destructive', size: 'sm' }
	};

	const { variant, size } = buttonConfig[type] ?? { variant: 'secondary' as ButtonVariant, size: 'sm' as const };
</script>

<Button type="button" {variant} {size} {disabled} {onclick}>
	{@render children()}
</Button>
