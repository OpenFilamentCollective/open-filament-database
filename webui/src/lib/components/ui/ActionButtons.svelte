<script lang="ts">
	import Button from './Button.svelte';

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
</script>

<div class="flex gap-2">
	<Button onclick={onEdit} variant={editVariant}>
		{editLabel}
	</Button>
	<Button onclick={onDelete} variant="destructive">
		{deleteLabel}
	</Button>
</div>
