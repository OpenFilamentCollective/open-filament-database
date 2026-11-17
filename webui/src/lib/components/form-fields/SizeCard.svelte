<script lang="ts">
	import type { Store, ContainerDetails, ContainerMaterial } from '$lib/types/database';
	import { TrashIcon } from '$lib/components/icons';
	import { FormFieldRow, PurchaseLinksSection, CheckboxField } from '$lib/components/form-fields';
	import SourcedEntryFields from './SourcedEntryFields.svelte';
	import { newEntry, VALUE_FIELDS } from '$lib/utils/sustainability';
	import { Button } from '$lib/components/ui';
	import {
		CARD_CLASSES,
		CARD_HEADER_CLASSES,
		DOT_INDICATOR,
		INPUT_COMPACT_CLASSES,
		LABEL_COMPACT_CLASSES
	} from '$lib/styles/formStyles';

	interface PurchaseLinkWithId {
		id: number;
		value: {
			store_id: string;
			url: string;
		};
	}

	interface SizeValue {
		filament_weight: number | undefined;
		diameter: number;
		empty_spool_weight?: number;
		spool_core_diameter?: number;
		gtin?: string;
		article_number?: string;
		discontinued?: boolean;
		container_material?: ContainerMaterial;
		container_details?: ContainerDetails;
		purchase_links: PurchaseLinkWithId[];
	}

	interface Props {
		id: number;
		value: SizeValue;
		index: number;
		stores: Store[];
		canRemove: boolean;
		onRemove: () => void;
		onAddLink: () => void;
		onRemoveLink: (linkIndex: number) => void;
		/** Other colours of this filament already using a given URL. */
		sharedWith?: (url: string) => string[];
		/** sizes_schema.json's container_details schema; the sub-form is hidden without it. */
		containerDetailsSchema?: any;
	}

	let {
		id,
		value = $bindable(),
		index,
		stores,
		canRemove,
		onRemove,
		onAddLink,
		onRemoveLink,
		sharedWith,
		containerDetailsSchema
	}: Props = $props();

	function addContainerDetails() {
		value.container_details = newEntry(containerDetailsSchema) as ContainerDetails;
	}
</script>

<div class={CARD_CLASSES}>
	<div class="flex justify-between items-center mb-3">
		<h4 class={CARD_HEADER_CLASSES}>
			<span class={DOT_INDICATOR}></span>
			Size {index + 1}
		</h4>
		{#if canRemove}
			<Button
				type="button"
				onclick={onRemove}
				title="Remove size {index + 1}"
				variant="ghost"
				size="icon"
				class="text-destructive hover:text-destructive/80"
			>
				<TrashIcon />
			</Button>
		{/if}
	</div>

	<!-- Weight and Diameter (required) -->
	<FormFieldRow gap="sm">
		<div>
			<label for="size-{id}-weight" class={LABEL_COMPACT_CLASSES}>
				Weight (g) <span class="text-destructive">*</span>
			</label>
			<input
				id="size-{id}-weight"
				type="number"
				bind:value={value.filament_weight}
				class={INPUT_COMPACT_CLASSES}
				placeholder="1000"
				required
			/>
		</div>
		<div>
			<label for="size-{id}-diameter" class={LABEL_COMPACT_CLASSES}>
				Diameter (mm) <span class="text-destructive">*</span>
			</label>
			<select id="size-{id}-diameter" bind:value={value.diameter} class={INPUT_COMPACT_CLASSES}>
				<option value={1.75}>1.75</option>
				<option value={2.85}>2.85</option>
			</select>
		</div>
	</FormFieldRow>

	<!-- Spool weight and core diameter (optional) -->
	<FormFieldRow gap="sm">
		<div>
			<label for="size-{id}-spool-weight" class={LABEL_COMPACT_CLASSES}>Spool Weight (g)</label>
			<input
				id="size-{id}-spool-weight"
				type="number"
				bind:value={value.empty_spool_weight}
				class={INPUT_COMPACT_CLASSES}
				placeholder="250"
			/>
		</div>
		<div>
			<label for="size-{id}-core-diameter" class={LABEL_COMPACT_CLASSES}>Core Diameter (mm)</label>
			<input
				id="size-{id}-core-diameter"
				type="number"
				bind:value={value.spool_core_diameter}
				class={INPUT_COMPACT_CLASSES}
				placeholder="100"
			/>
		</div>
	</FormFieldRow>

	<!-- GTIN and Article Number (optional) -->
	<FormFieldRow gap="sm">
		<div>
			<label for="size-{id}-gtin" class={LABEL_COMPACT_CLASSES}>GTIN</label>
			<input
				id="size-{id}-gtin"
				type="text"
				bind:value={value.gtin}
				class={INPUT_COMPACT_CLASSES}
				placeholder="0123456789012"
			/>
		</div>
		<div>
			<label for="size-{id}-article" class={LABEL_COMPACT_CLASSES}>Article Number</label>
			<input
				id="size-{id}-article"
				type="text"
				bind:value={value.article_number}
				class={INPUT_COMPACT_CLASSES}
				placeholder="PLA-1000-BLK"
			/>
		</div>
	</FormFieldRow>

	<!-- Container material (optional) -->
	<FormFieldRow gap="sm">
		<div>
			<label for="size-{id}-container-material" class={LABEL_COMPACT_CLASSES}>Container Material</label>
			<select
				id="size-{id}-container-material"
				bind:value={value.container_material}
				class={INPUT_COMPACT_CLASSES}
			>
				<option value={undefined}>Not specified</option>
				<option value="plastic">Plastic</option>
				<option value="cardboard">Cardboard</option>
				<option value="mixed">Mixed (e.g. cardboard core, plastic sides)</option>
				<option value="refill">Refill (no spool)</option>
			</select>
		</div>
	</FormFieldRow>

	<!-- Sourced container details (optional) -->
	{#if containerDetailsSchema}
		{#if value.container_details}
			<div class="rounded-md border border-dashed p-3 mb-3">
				<div class="flex justify-between items-center mb-2">
					<span class={LABEL_COMPACT_CLASSES}>Container details (sourced)</span>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						class="text-destructive hover:text-destructive/80"
						onclick={() => (value.container_details = undefined)}
					>
						Remove
					</Button>
				</div>
				<SourcedEntryFields
					bind:entry={value.container_details as Record<string, any>}
					schema={containerDetailsSchema}
					idPrefix="size-{id}-container"
					valueFields={VALUE_FIELDS.container_details}
				/>
			</div>
		{:else}
			<Button type="button" variant="outline" size="sm" class="mb-3" onclick={addContainerDetails}>
				+ Container details (recycled %, FSC…)
			</Button>
		{/if}
	{/if}

	<!-- Checkbox: Discontinued -->
	<div class="flex gap-4 mb-3 mt-2">
		<CheckboxField bind:checked={value.discontinued as boolean} id="size-{id}-discontinued" label="Discontinued" />
	</div>

	<!-- Purchase Links Section -->
	<PurchaseLinksSection
		bind:links={value.purchase_links}
		{stores}
		sizeId={id}
		sizeIndex={index}
		{onAddLink}
		{onRemoveLink}
		{sharedWith}
	/>
</div>
