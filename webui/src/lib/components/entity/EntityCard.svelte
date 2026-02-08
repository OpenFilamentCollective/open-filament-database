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
		/** Badge to display (e.g., discontinued) */
		badge?: Badge;
		/** Custom content snippet */
		children?: Snippet;
		/** Color swatch hex (for variants) */
		colorHex?: string;
		/** Whether to show logo (default: true if logo provided) */
		showLogo?: boolean;
		/** Secondary info text (e.g., sizes count) */
		secondaryInfo?: string;
		/** Whether this entity has local changes */
		hasLocalChanges?: boolean;
		/** The type of local change: 'create', 'update', or 'delete' */
		localChangeType?: 'create' | 'update' | 'delete';
		/** Whether any descendant entity has local changes */
		hasDescendantChanges?: boolean;
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
		badge,
		children,
		colorHex,
		showLogo = true,
		secondaryInfo,
		hasLocalChanges = false,
		localChangeType,
		hasDescendantChanges = false
	}: Props = $props();

	const displayName = $derived(name ?? entity.name);
	const displayId = $derived(id ?? entity.slug ?? entity.id);

	// Determine local change styling
	const localChangeClass = $derived.by(() => {
		if (hasLocalChanges) {
			switch (localChangeType) {
				case 'create':
					return 'border-l-4 border-l-green-500';
				case 'update':
					return 'border-l-4 border-l-yellow-500';
				case 'delete':
					return 'border-l-4 border-l-destructive';
				default:
					return 'border-l-4 border-l-primary';
			}
		}
		if (hasDescendantChanges) {
			return 'border-l-4 border-l-blue-400/50';
		}
		return '';
	});
</script>

<a
	{href}
	class="block rounded-lg border bg-card p-6 shadow-sm transition-colors hover:bg-accent {localChangeClass}"
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
			<div class="flex items-center gap-2">
				<h3 class="font-semibold text-lg truncate">{displayName}</h3>
				{#if hasLocalChanges}
					<span
						class="shrink-0 px-1.5 py-0.5 text-xs rounded {localChangeType === 'create' ? 'bg-green-500/20 text-green-700 dark:text-green-400' : localChangeType === 'update' ? 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400' : localChangeType === 'delete' ? 'bg-destructive/20 text-destructive' : 'bg-primary/20 text-primary'}"
						title={localChangeType === 'create' ? 'Locally created' : localChangeType === 'update' ? 'Locally modified' : localChangeType === 'delete' ? 'Marked for deletion' : 'Has local changes'}
					>
						{localChangeType === 'create' ? 'New' : localChangeType === 'update' ? 'Modified' : localChangeType === 'delete' ? 'Deleted' : 'Changed'}
					</span>
				{:else if hasDescendantChanges}
					<span
						class="shrink-0 w-2 h-2 rounded-full bg-blue-400"
						title="Contains items with local changes"
					></span>
				{/if}
			</div>
			<p class="text-xs text-muted-foreground truncate">
				{#if displayId}
					ID: {displayId}
				{/if}
			</p>
			{#if secondaryInfo}
				<p class="text-xs text-muted-foreground mt-0.5">{secondaryInfo}</p>
			{/if}
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
