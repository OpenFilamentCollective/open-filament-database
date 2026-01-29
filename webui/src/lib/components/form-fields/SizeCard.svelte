<script lang="ts">
	import type { Store } from '$lib/types/database';
	import { TrashIcon } from '$lib/components/icons';
	import { FormFieldRow, PurchaseLinksSection, CheckboxField } from '$lib/components/form-fields';
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
		spool_refill?: boolean;
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
	}

	let {
		id,
		value = $bindable(),
		index,
		stores,
		canRemove,
		onRemove,
		onAddLink,
		onRemoveLink
	}: Props = $props();
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

	<!-- Checkboxes: Discontinued and Spool Refill -->
	<div class="flex gap-4 mb-3 mt-2">
		<CheckboxField bind:checked={value.discontinued} id="size-{id}-discontinued" label="Discontinued" />
		<CheckboxField bind:checked={value.spool_refill} id="size-{id}-spool-refill" label="Spool Refill" />
	</div>

	<!-- Purchase Links Section -->
	<PurchaseLinksSection
		bind:links={value.purchase_links}
		{stores}
		sizeId={id}
		sizeIndex={index}
		{onAddLink}
		{onRemoveLink}
	/>
</div>
