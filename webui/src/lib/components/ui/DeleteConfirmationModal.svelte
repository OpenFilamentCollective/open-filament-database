<script lang="ts">
	import Modal from './Modal.svelte';
	import { isCloudMode } from '$lib/stores/environment';

	interface Props {
		show: boolean;
		title: string;
		entityName: string;
		isLocalCreate: boolean;
		deleting: boolean;
		onClose: () => void;
		onDelete: () => void;
		/** Additional warning text (e.g., "This will also delete all filaments") */
		cascadeWarning?: string;
	}

	let {
		show,
		title,
		entityName,
		isLocalCreate,
		deleting,
		onClose,
		onDelete,
		cascadeWarning
	}: Props = $props();
</script>

<Modal {show} {title} {onClose} maxWidth="md">
	<div class="space-y-4">
		<p class="text-foreground">
			Are you sure you want to delete <strong>{entityName}</strong>?
		</p>

		{#if cascadeWarning}
			<p class="text-muted-foreground text-sm">{cascadeWarning}</p>
		{/if}

		{#if $isCloudMode}
			<div class="bg-primary/10 border border-primary/20 rounded p-3">
				<p class="text-sm text-primary">
					{#if isLocalCreate}
						This will remove the locally created item. The change will be discarded.
					{:else}
						This will mark the item for deletion. Remember to export your changes.
					{/if}
				</p>
			</div>
		{:else}
			<div class="bg-destructive/10 border border-destructive/20 rounded p-3">
				<p class="text-sm text-destructive">
					This action cannot be undone. The item will be permanently deleted.
				</p>
			</div>
		{/if}

		<div class="flex justify-end gap-2 pt-4">
			<button
				onclick={onClose}
				disabled={deleting}
				class="bg-muted text-muted-foreground hover:bg-muted/80 px-4 py-2 rounded-md font-medium disabled:opacity-50"
			>
				Cancel
			</button>
			<button
				onclick={onDelete}
				disabled={deleting}
				class="bg-destructive text-destructive-foreground hover:bg-destructive/90 px-4 py-2 rounded-md font-medium disabled:opacity-50"
			>
				{deleting ? 'Deleting...' : 'Delete'}
			</button>
		</div>
	</div>
</Modal>
