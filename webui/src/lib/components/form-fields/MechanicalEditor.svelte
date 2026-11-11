<script lang="ts">
	/**
	 * Editor for a filament's `mechanical` list: one value per property, print direction
	 * and condition, each with its source.
	 *
	 * Copy, never compute: the quote must contain the value (and ±) as written, in the
	 * unit the data sheet uses. psi stays psi, and XY and Z are never averaged.
	 */
	import { Button } from '$lib/components/ui';
	import { TrashIcon, PlusIcon } from '$lib/components/icons';
	import {
		CARD_CLASSES,
		CARD_HEADER_CLASSES,
		DOT_INDICATOR,
		LABEL_COMPACT_CLASSES
	} from '$lib/styles/formStyles';
	import {
		checkMechanicalEntry,
		findDuplicateMechanical,
		MECHANICAL_VALUE_FIELDS,
		type EntryIssue
	} from '$lib/utils/dataQuality';
	import {
		OPTION_LABELS,
		newMechanicalEntry,
		propertyLabel,
		specimenSchema,
		valueFieldsSchema
	} from '$lib/utils/mechanical';
	import type { Entry, JsonSchema } from '$lib/utils/sustainability';
	import SourcedEntryFields from './SourcedEntryFields.svelte';
	import Tooltip from './Tooltip.svelte';

	interface Props {
		value: Entry[];
		/** schemas/mechanical_schema.json */
		schema: JsonSchema;
		idPrefix?: string;
	}

	let { value = $bindable(), schema, idPrefix = 'mechanical' }: Props = $props();

	let fieldsSchema = $derived(valueFieldsSchema(schema));
	let specimen = $derived(specimenSchema(schema));
	let itemTitle = $derived(schema?.items?.title ?? 'Mechanical Property');
	let duplicates = $derived(findDuplicateMechanical(value));

	function issues(entry: Entry, index: number): EntryIssue[] {
		const found = checkMechanicalEntry(entry);
		const first = duplicates.get(index);
		if (first !== undefined) {
			found.push({
				level: 'warning',
				message: `Entry ${first + 1} already has this property, direction, condition, standard, unit and specimen. Remove one, or set what tells them apart.`
			});
		}
		return found;
	}

	function add() {
		value = [...value, newMechanicalEntry(schema)];
	}

	function remove(index: number) {
		value = value.filter((_, i) => i !== index);
	}
</script>

<div class="space-y-3">
	<p class="text-xs text-muted-foreground">
		Copy each value exactly as the data sheet writes it, in its unit, and paste the line it appears
		in. Add one entry per print direction. Never convert units or average directions.
	</p>

	{#each value as entry, i (entry)}
		<div class={CARD_CLASSES}>
			<div class="mb-3 flex items-center justify-between">
				<h4 class={CARD_HEADER_CLASSES}>
					<span class={DOT_INDICATOR}></span>
					{i + 1}. {entry.property ? propertyLabel(entry.property) : itemTitle}
					{#if entry.direction && entry.direction !== 'unknown'}({entry.direction}){/if}
				</h4>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					title="Remove entry {i + 1}"
					class="text-destructive hover:text-destructive/80"
					onclick={() => remove(i)}
				>
					<TrashIcon />
				</Button>
			</div>
			<SourcedEntryFields
				bind:entry={value[i]}
				schema={fieldsSchema}
				idPrefix="{idPrefix}-{i}"
				valueFields={MECHANICAL_VALUE_FIELDS}
				issues={issues(entry, i)}
				optionLabels={OPTION_LABELS}
			/>

			{#if specimen}
				{#if entry.specimen}
					<div class="mt-3 rounded-md border border-dashed p-3">
						<div class="mb-2 flex items-center justify-between">
							<span class="{LABEL_COMPACT_CLASSES} flex items-center gap-1">
								{specimen.title ?? 'Specimen'}
								{#if specimen.description}<Tooltip text={specimen.description} />{/if}
							</span>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								class="text-destructive hover:text-destructive/80"
								onclick={() => delete value[i].specimen}
							>
								Remove
							</Button>
						</div>
						<SourcedEntryFields
							bind:entry={value[i].specimen}
							schema={specimen}
							idPrefix="{idPrefix}-{i}-specimen"
							valueFields={[]}
							issues={[]}
						/>
					</div>
				{:else}
					<Button
						type="button"
						variant="outline"
						size="sm"
						class="mt-3"
						onclick={() => (value[i].specimen = {})}
					>
						+ Specimen (printer, infill, layer height…)
					</Button>
				{/if}
			{/if}
		</div>
	{/each}

	<Button type="button" variant="outline" size="sm" onclick={add}>
		<PlusIcon />
		{itemTitle}
	</Button>
</div>
