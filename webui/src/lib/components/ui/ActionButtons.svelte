<script lang="ts">
	interface Props {
		onEdit: () => void;
		onDelete: () => void;
		editLabel?: string;
		deleteLabel?: string;
		editVariant?: 'primary' | 'secondary';
	}

	let {
		onEdit,
		onDelete,
		editLabel = 'Edit',
		deleteLabel = 'Delete',
		editVariant = 'secondary'
	}: Props = $props();

	const editClass = $derived(
		editVariant === 'primary'
			? 'bg-primary text-primary-foreground hover:bg-primary/90'
			: 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
	);
</script>

<div class="flex gap-2">
	<button onclick={onEdit} class="{editClass} px-4 py-2 rounded-md font-medium">
		{editLabel}
	</button>
	<button
		onclick={onDelete}
		class="bg-destructive text-destructive-foreground hover:bg-destructive/90 px-4 py-2 rounded-md font-medium"
	>
		{deleteLabel}
	</button>
</div>
