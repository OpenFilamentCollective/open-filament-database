<script lang="ts">
	import type { Snippet } from 'svelte';
	import Logo from './Logo.svelte';

	interface Field {
		key: string;
		label?: string;
		format?: (value: any) => string;
		class?: string;
	}

	interface Badge {
		text: string;
		color: string;
	}

	interface Props {
		/** The entity data to display */
		entity: any;
		/** Link href for the card */
		href: string;
		/** Entity name (defaults to entity.name) */
		name?: string;
		/** Entity ID to display (defaults to entity.slug ?? entity.id) */
		id?: string;
		/** Logo URL (optional) */
		logo?: string;
		/** Logo type for Logo component */
		logoType?: 'brand' | 'store';
		/** Logo entity ID for Logo component */
		logoEntityId?: string;
		/** Fields to display in the card body */
		fields?: Field[];
		/** Hover border color (e.g., 'green', 'blue', 'orange') */
		hoverColor?: string;
		/** Badge to display (e.g., discontinued) */
		badge?: Badge;
		/** Custom content snippet */
		children?: Snippet;
		/** Color swatch hex (for variants) */
		colorHex?: string;
		/** Whether to show logo (default: true if logo provided) */
		showLogo?: boolean;
	}

	let {
		entity,
		href,
		name,
		id,
		logo,
		logoType,
		logoEntityId,
		fields = [],
		hoverColor = 'blue',
		badge,
		children,
		colorHex,
		showLogo = true
	}: Props = $props();

	const displayName = $derived(name ?? entity.name);
	const displayId = $derived(id ?? entity.slug ?? entity.id);
	const hoverClass = $derived(`hover:border-${hoverColor}-500`);
</script>

<a
	{href}
	class="block p-6 border border-border rounded-lg {hoverClass} hover:shadow-lg transition-all"
>
	<div class="flex items-center gap-4 mb-4">
		{#if colorHex}
			<!-- Color swatch for variants -->
			<div
				class="w-8 h-8 rounded-full border-2 border-border shrink-0"
				style="background-color: {colorHex}"
				title={colorHex}
			></div>
		{:else if logo && showLogo && logoType}
			<!-- Logo for brands/stores -->
			<Logo src={logo} alt={displayName} type={logoType} id={logoEntityId ?? displayId} size="md" />
		{/if}
		<div class="flex-1 min-w-0">
			<h3 class="font-semibold text-lg truncate">{displayName}</h3>
			<p class="text-xs text-muted-foreground truncate">
				{#if displayId}
					ID: {displayId}
				{/if}
			</p>
			{#if badge}
				<span
					class="inline-block mt-1 px-2 py-1 text-xs bg-{badge.color}-100 text-{badge.color}-800 rounded"
				>
					{badge.text}
				</span>
			{/if}
		</div>
		<span class="text-muted-foreground shrink-0">→</span>
	</div>

	{#if fields.length > 0}
		<div class="space-y-1 text-sm">
			{#each fields as field}
				<p class={field.class ?? 'text-muted-foreground'}>
					{#if field.label}
						{field.label}:
					{/if}
					{field.format ? field.format(entity[field.key]) : entity[field.key]}
				</p>
			{/each}
		</div>
	{/if}

	{#if children}
		{@render children()}
	{/if}
</a>
