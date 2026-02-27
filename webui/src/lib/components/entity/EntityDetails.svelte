<script lang="ts">
	import type { Snippet } from 'svelte';
	import Logo from './Logo.svelte';

	interface Field {
		key: string;
		label?: string;
		format?: (value: any) => string;
		type?: 'text' | 'link' | 'color' | 'logo' | 'custom';
		customRender?: Snippet<[any]>;
		hide?: boolean | ((value: any) => boolean);
		logoType?: 'brand' | 'store';
		logoEntityId?: string;
		/** If true, this field spans the full width in grid mode */
		fullWidth?: boolean;
	}

	interface Props {
		/** The entity data to display */
		entity: any;
		/** Fields to display */
		fields: Field[];
		/** Optional title */
		title?: string;
		/** Action buttons snippet */
		actions?: Snippet;
		/** Custom class for the container */
		class?: string;
		/** Display fields in a 2-column grid */
		grid?: boolean;
	}

	let { entity, fields, title, actions, class: className = '', grid = false }: Props = $props();

	function isSafeUrl(url: unknown): boolean {
		if (typeof url !== 'string') return false;
		try {
			const parsed = new URL(url);
			return parsed.protocol === 'http:' || parsed.protocol === 'https:';
		} catch {
			return false;
		}
	}

	function shouldHideField(field: Field): boolean {
		if (field.hide === undefined) return false;
		if (typeof field.hide === 'boolean') return field.hide;
		return field.hide(entity[field.key]);
	}

	function getFieldLabel(field: Field): string {
		if (field.label) return field.label;
		// Convert snake_case to Title Case
		return field.key
			.split('_')
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
			.join(' ');
	}
</script>

<div class="bg-card border border-border rounded-lg p-6 {className}">
	{#if title || actions}
		<div class="flex justify-between items-center mb-4">
			{#if title}
				<h2 class="text-xl font-semibold">{title}</h2>
			{/if}
			{#if actions}
				{@render actions()}
			{/if}
		</div>
	{/if}

	<dl class={grid ? 'grid grid-cols-1 md:grid-cols-2 gap-4' : 'space-y-4'}>
		{#each fields as field}
			{#if !shouldHideField(field)}
				<div class={grid && field.fullWidth ? 'md:col-span-2' : ''}>
					<dt class="text-sm font-medium text-muted-foreground">{getFieldLabel(field)}</dt>
					<dd class="mt-1">
						{#if field.customRender}
							{@render field.customRender(entity[field.key])}
						{:else if field.type === 'logo'}
							{#if entity[field.key] && field.logoType}
								<div class="flex items-center gap-3">
									<Logo
										src={entity[field.key]}
										alt={entity.name || 'Logo'}
										type={field.logoType}
										id={field.logoEntityId || entity.slug || entity.id}
										size="md"
									/>
									<span class="text-sm text-muted-foreground">{entity[field.key]}</span>
								</div>
							{:else}
								<span class="text-sm text-muted-foreground">No logo</span>
							{/if}
						{:else if field.type === 'link'}
							{#if isSafeUrl(entity[field.key])}
								<a
									href={entity[field.key]}
									target="_blank"
									rel="noopener noreferrer"
									class="text-primary hover:underline truncate block"
								>
									{field.format ? field.format(entity[field.key]) : entity[field.key]}
								</a>
							{:else}
								<span class="text-muted-foreground truncate block">
									{entity[field.key] || 'No URL'}
								</span>
							{/if}
						{:else if field.type === 'color'}
							<div class="flex items-center gap-2">
								<div
									class="w-8 h-8 rounded border-2 border-border"
									style="background-color: {entity[field.key]}"
								></div>
								<span class="font-mono">
									{field.format ? field.format(entity[field.key]) : entity[field.key]}
								</span>
							</div>
						{:else}
							<span class="text-lg">
								{field.format ? field.format(entity[field.key]) : entity[field.key]}
							</span>
						{/if}
					</dd>
				</div>
			{/if}
		{/each}
	</dl>
</div>
