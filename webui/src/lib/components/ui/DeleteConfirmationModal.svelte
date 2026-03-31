<script lang="ts">
	import Modal from './Modal.svelte';
	import Button from './Button.svelte';
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

		<div class="bg-primary/10 border border-primary/20 rounded p-3">
			<p class="text-sm text-primary">
				{#if isLocalCreate}
					This will remove the locally created item. The change will be discarded.
				{:else}
					This will mark the item for deletion. Remember to export your changes.
				{/if}
			</p>
		</div>

		<div class="flex justify-end gap-2 pt-4">
			<Button onclick={onClose} disabled={deleting} variant="secondary">
				Cancel
			</Button>
			<Button onclick={onDelete} disabled={deleting} variant="destructive">
				{deleting ? 'Deleting...' : 'Delete'}
			</Button>
		</div>
	</div>
</Modal>
