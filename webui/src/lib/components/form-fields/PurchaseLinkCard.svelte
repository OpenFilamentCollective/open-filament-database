<script lang="ts">
	import type { Store } from '$lib/types/database';
	import { INPUT_XS_CLASSES, LABEL_COMPACT_CLASSES } from '$lib/styles/formStyles';

	interface Props {
		storeId: string;
		url: string;
		stores: Store[];
		index: number;
		sizeId: number;
		linkId: number;
		onRemove: () => void;
	}

	let {
		storeId = $bindable(''),
		url = $bindable(''),
		stores,
		index,
		sizeId,
		linkId,
		onRemove
	}: Props = $props();
</script>

<div class="border border-border/50 rounded p-2 mb-2 bg-muted/30">
	<div class="flex justify-between items-center mb-2">
		<span class="text-xs font-medium">Link {index + 1}</span>
		<button
			type="button"
			onclick={onRemove}
			aria-label="Remove purchase link {index + 1}"
			class="text-destructive hover:text-destructive/80 text-xs"
		>
			Remove
		</button>
	</div>

	<div class="space-y-2">
		<!-- Store dropdown -->
		<div>
			<label for="size-{sizeId}-link-{linkId}-store" class={LABEL_COMPACT_CLASSES}>
				Store <span class="text-destructive">*</span>
			</label>
			<select id="size-{sizeId}-link-{linkId}-store" bind:value={storeId} class={INPUT_XS_CLASSES}>
				<option value="">Select store...</option>
				{#each stores as store}
					<option value={store.id}>{store.name}</option>
				{/each}
			</select>
		</div>

		<!-- URL -->
		<div>
			<label for="size-{sizeId}-link-{linkId}-url" class={LABEL_COMPACT_CLASSES}>
				URL <span class="text-destructive">*</span>
			</label>
			<input
				id="size-{sizeId}-link-{linkId}-url"
				type="url"
				bind:value={url}
				class={INPUT_XS_CLASSES}
				placeholder="https://store.com/product/..."
			/>
		</div>
	</div>
</div>
