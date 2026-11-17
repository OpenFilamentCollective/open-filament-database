<script lang="ts">
	/**
	 * Editor for a filament's or variant's `sustainability` block.
	 *
	 * Copy, never compute: every figure is copied from a cited source, and the quote
	 * must contain the number as written. Offsets, "carbon neutral" and other generic
	 * green claims are never stored (see docs/manual.md).
	 */
	import type { Sustainability } from '$lib/types/database';
	import { Button } from '$lib/components/ui';
	import { TrashIcon, PlusIcon } from '$lib/components/icons';
	import { CARD_CLASSES, CARD_HEADER_CLASSES, DOT_INDICATOR } from '$lib/styles/formStyles';
	import SourcedEntryFields from './SourcedEntryFields.svelte';
	import {
		OBJECT_SECTIONS,
		ARRAY_SECTIONS,
		VALUE_FIELDS,
		entrySchema,
		newEntry,
		type Entry,
		type JsonSchema,
		type SustainabilitySection
	} from '$lib/utils/sustainability';

	interface Props {
		value: Sustainability;
		/** schemas/sustainability_schema.json */
		schema: JsonSchema;
		idPrefix?: string;
		/** Shown above the sections, e.g. the variant override rule. */
		note?: string;
	}

	let { value = $bindable(), schema, idPrefix = 'sustainability', note = '' }: Props = $props();

	function title(section: SustainabilitySection): string {
		return schema?.properties?.[section]?.title ?? section;
	}

	function addObject(section: (typeof OBJECT_SECTIONS)[number]) {
		value[section] = newEntry(entrySchema(schema, section)) as never;
	}

	function removeObject(section: (typeof OBJECT_SECTIONS)[number]) {
		delete value[section];
	}

	function addItem(section: (typeof ARRAY_SECTIONS)[number]) {
		value[section] = [...(value[section] ?? []), newEntry(entrySchema(schema, section))] as never;
	}

	function removeItem(section: (typeof ARRAY_SECTIONS)[number], index: number) {
		const next = (value[section] ?? []).filter((_, i) => i !== index);
		if (next.length) value[section] = next as never;
		else delete value[section];
	}
</script>

<div class="space-y-3">
	<p class="text-xs text-muted-foreground">
		Copy every figure exactly as the source writes it, and paste the sentence it appears in. Never
		derive, average or convert. Leave out offsets, "carbon neutral" and other generic green claims.
		{note}
	</p>

	{#each OBJECT_SECTIONS as section (section)}
		{#if value[section]}
			<div class={CARD_CLASSES}>
				<div class="mb-3 flex items-center justify-between">
					<h4 class={CARD_HEADER_CLASSES}><span class={DOT_INDICATOR}></span> {title(section)}</h4>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						title="Remove {title(section)}"
						class="text-destructive hover:text-destructive/80"
						onclick={() => removeObject(section)}
					>
						<TrashIcon />
					</Button>
				</div>
				<SourcedEntryFields
					bind:entry={value[section] as Entry}
					schema={entrySchema(schema, section)}
					idPrefix="{idPrefix}-{section}"
					valueFields={VALUE_FIELDS[section]}
				/>
			</div>
		{/if}
	{/each}

	{#each ARRAY_SECTIONS as section (section)}
		{#each value[section] ?? [] as entry, i (entry)}
			<div class={CARD_CLASSES}>
				<div class="mb-3 flex items-center justify-between">
					<h4 class={CARD_HEADER_CLASSES}>
						<span class={DOT_INDICATOR}></span>
						{title(section)}
						{i + 1}
					</h4>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						title="Remove {title(section)} {i + 1}"
						class="text-destructive hover:text-destructive/80"
						onclick={() => removeItem(section, i)}
					>
						<TrashIcon />
					</Button>
				</div>
				<SourcedEntryFields
					bind:entry={value[section]![i] as Entry}
					schema={entrySchema(schema, section)}
					idPrefix="{idPrefix}-{section}-{i}"
					valueFields={VALUE_FIELDS[section]}
				/>
			</div>
		{/each}
	{/each}

	<div class="flex flex-wrap gap-2">
		{#each OBJECT_SECTIONS as section (section)}
			{#if !value[section]}
				<Button type="button" variant="outline" size="sm" onclick={() => addObject(section)}>
					<PlusIcon />
					{title(section)}
				</Button>
			{/if}
		{/each}
		{#each ARRAY_SECTIONS as section (section)}
			<Button type="button" variant="outline" size="sm" onclick={() => addItem(section)}>
				<PlusIcon />
				{title(section)}
			</Button>
		{/each}
	</div>
</div>
