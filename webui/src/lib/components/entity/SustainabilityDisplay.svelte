<script lang="ts">
	/**
	 * Read-only view of a sustainability block. Every figure is shown with its scope
	 * (unit, boundary, packaging, verification) and the verbatim source quote, because a
	 * number without its scope is easy to misread or compare against the wrong thing.
	 *
	 * On a variant page, pass `filament` too: the variant's fields override the
	 * filament's per field, and each section says which one it came from.
	 */
	import type { Sustainability, SourcedEntry } from '$lib/types/database';
	import { enumLabel } from '$lib/utils/sustainability';

	interface Props {
		sustainability?: Sustainability;
		/** Parent filament's block, when showing a variant. */
		filament?: Sustainability;
	}

	let { sustainability, filament }: Props = $props();

	const UNIT_LABELS: Record<string, string> = {
		per_kg_filament: 'per kg filament',
		per_spool_as_sold: 'per spool as sold'
	};

	const BOUNDARY_LABELS: Record<string, string> = {
		resin_cradle_to_gate: 'Resin, cradle to gate',
		filament_cradle_to_gate: 'Filament, cradle to gate',
		cradle_to_customer: 'Cradle to customer',
		cradle_to_grave: 'Cradle to grave',
		unknown: 'Boundary not stated'
	};

	type Origin = 'variant' | 'filament' | null;

	function pick<K extends keyof Sustainability>(
		key: K
	): { value: Sustainability[K]; origin: Origin } {
		if (sustainability?.[key] !== undefined)
			return { value: sustainability[key], origin: filament ? 'variant' : null };
		if (filament?.[key] !== undefined) return { value: filament[key], origin: 'filament' };
		return { value: undefined, origin: null };
	}

	let recycled = $derived(pick('recycled_content'));
	let bio = $derived(pick('bio_based_content'));
	let footprints = $derived(pick('carbon_footprints'));
	let claims = $derived(pick('relative_claims'));

	function pct(value: number | null | undefined, qualifier?: string): string {
		if (value === null || value === undefined) return 'Share not stated';
		const prefix = qualifier === 'up_to' ? 'Up to ' : qualifier === 'at_least' ? 'At least ' : '';
		return `${prefix}${value}%`;
	}
</script>

{#snippet origin(o: Origin)}
	{#if o === 'filament'}
		<span class="text-xs text-muted-foreground">(from filament)</span>
	{:else if o === 'variant'}
		<span class="text-xs text-muted-foreground">(overrides filament)</span>
	{/if}
{/snippet}

{#snippet source(entry: SourcedEntry)}
	<details class="mt-1 text-xs">
		<summary class="cursor-pointer text-muted-foreground">
			Source{entry.source_type === 'secondary' ? ' (secondary)' : ''}, retrieved {entry.retrieved}
		</summary>
		<blockquote class="mt-1 border-l-2 pl-2 text-muted-foreground italic">
			“{entry.source_quote}”
		</blockquote>
		<!-- eslint-disable svelte/no-navigation-without-resolve -- external source link -->
		<a
			href={entry.source_url}
			target="_blank"
			rel="noopener noreferrer"
			class="break-all text-primary hover:underline"
		>
			{entry.source_url}
		</a>
		<!-- eslint-enable svelte/no-navigation-without-resolve -->
		{#if entry.notes}<p class="mt-1 text-muted-foreground">{entry.notes}</p>{/if}
	</details>
{/snippet}

{#snippet badge(text: string, warn = false)}
	<span
		class="rounded px-1.5 py-0.5 text-xs {warn
			? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
			: 'bg-muted text-muted-foreground'}">{text}</span
	>
{/snippet}

<div class="space-y-3 text-sm">
	{#if recycled.value}
		{@const r = recycled.value}
		<div>
			<div class="flex flex-wrap items-center gap-1.5">
				<span class="font-medium">Recycled content:</span>
				<span>{pct(r.pct, r.pct_qualifier)}</span>
				{@render badge(enumLabel(r.type))}
				{@render badge(enumLabel(r.evidence))}
				{@render origin(recycled.origin)}
			</div>
			{@render source(r)}
		</div>
	{/if}

	{#if bio.value}
		{@const b = bio.value}
		<div>
			<div class="flex flex-wrap items-center gap-1.5">
				<span class="font-medium">Bio-based content:</span>
				<span>{pct(b.pct, b.pct_qualifier)}</span>
				{@render badge(enumLabel(b.method))}
				{@render origin(bio.origin)}
			</div>
			{@render source(b)}
		</div>
	{/if}

	{#each footprints.value ?? [] as f, i (i)}
		<div>
			<div class="flex flex-wrap items-center gap-1.5">
				<span class="font-medium">Carbon footprint:</span>
				<span>{f.value_kg_co2e} kg CO₂e {UNIT_LABELS[f.declared_unit] ?? ''}</span>
				{#if f.declared_unit === 'unknown'}{@render badge('Unit not stated', true)}{/if}
				{@render badge(
					BOUNDARY_LABELS[f.boundary] ?? enumLabel(f.boundary),
					f.boundary === 'unknown'
				)}
				{@render badge(`Packaging: ${f.packaging_included}`)}
				{@render badge(f.method.toUpperCase() === 'LCA' ? 'LCA' : enumLabel(f.method))}
				{@render badge(
					f.verification === 'none' ? 'Not verified' : enumLabel(f.verification),
					f.verification === 'none'
				)}
				{#if !f.publicly_available}{@render badge('Study on request')}{/if}
				{#if i === 0}{@render origin(footprints.origin)}{/if}
			</div>
			{#if f.tool || f.practitioner || f.published || f.standard}
				<p class="mt-0.5 text-xs text-muted-foreground">
					{[f.standard, f.tool, f.practitioner, f.published ? `published ${f.published}` : null]
						.filter(Boolean)
						.join(' · ')}
				</p>
			{/if}
			{@render source(f)}
		</div>
	{/each}

	{#each claims.value ?? [] as c, i (i)}
		<div>
			<div class="flex flex-wrap items-center gap-1.5">
				<span class="font-medium">Relative claim:</span>
				<span>{c.reduction_pct}% lower {c.metric === 'gwp' ? 'GWP' : ''} than “{c.baseline}”</span>
				{#if i === 0}{@render origin(claims.origin)}{/if}
			</div>
			{@render source(c)}
		</div>
	{/each}
</div>
