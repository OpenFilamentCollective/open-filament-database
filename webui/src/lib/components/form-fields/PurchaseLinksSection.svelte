<script lang="ts">
	import type { Store } from '$lib/types/database';
	import { Button } from '$lib/components/ui';
	import PurchaseLinkCard from './PurchaseLinkCard.svelte';

	interface PurchaseLinkWithId {
		id: number;
		value: {
			store_id: string;
			url: string;
		};
	}

	interface Props {
		links: PurchaseLinkWithId[];
		stores: Store[];
		sizeId: number;
		sizeIndex: number;
		onAddLink: () => void;
		onRemoveLink: (linkIndex: number) => void;
	}

	let { links = $bindable([]), stores, sizeId, sizeIndex, onAddLink, onRemoveLink }: Props = $props();
</script>

<div class="border-t pt-2 mt-2">
	<div class="flex items-center justify-between mb-2">
		<span class="text-xs font-medium text-muted-foreground">Purchase Links</span>
		<Button
			type="button"
			onclick={onAddLink}
			title="Add purchase link to size {sizeIndex + 1}"
			variant="secondary"
			size="sm"
		>
			+ Add Link
		</Button>
	</div>

	{#if links.length > 0}
		{#each links as link, linkIndex (link.id)}
			<PurchaseLinkCard
				bind:storeId={link.value.store_id}
				bind:url={link.value.url}
				{stores}
				index={linkIndex}
				{sizeId}
				linkId={link.id}
				onRemove={() => onRemoveLink(linkIndex)}
			/>
		{/each}
	{:else}
		<p class="text-xs text-muted-foreground text-center py-2">No purchase links added.</p>
	{/if}
</div>
