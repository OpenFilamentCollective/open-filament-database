<script lang="ts">
	import { BasicForm } from '@sjsf/form';
	import type { Snippet } from 'svelte';

	interface Props {
		title: string;
		editMode: boolean;
		saving?: boolean;
		form?: any;
		onEdit: () => void;
		onCancel: () => void;
		onDelete?: () => void;
		editButtonText?: string;
		editButtonClass?: string;
		deleteButtonClass?: string;
		children?: Snippet;
		formContent?: Snippet;
	}

	let {
		title,
		editMode,
		saving = false,
		form = null,
		onEdit,
		onCancel,
		onDelete,
		editButtonText = 'Edit',
		editButtonClass = 'px-4 py-2 bg-secondary text-secondary-foreground rounded hover:bg-secondary/80 transition-colors',
		deleteButtonClass = 'px-4 py-2 bg-destructive text-destructive-foreground rounded hover:bg-destructive/90 transition-colors',
		children,
		formContent
	}: Props = $props();
</script>

<div class="bg-card border border-border rounded-lg p-6">
	{#if !editMode}
		<div class="mb-6">
			<div class="flex justify-between items-center mb-4">
				<h2 class="text-xl font-semibold">{title}</h2>
				<div class="flex gap-2">
					<button onclick={onEdit} class={editButtonClass}>
						{editButtonText}
					</button>
					{#if onDelete}
						<button onclick={onDelete} class={deleteButtonClass}>
							Delete
						</button>
					{/if}
				</div>
			</div>

			{#if children}
				{@render children()}
			{/if}
		</div>
	{:else}
		<div>
			<div class="flex justify-between items-center mb-4">
				<h2 class="text-xl font-semibold">Edit {title}</h2>
				<button
					onclick={onCancel}
					class="px-4 py-2 bg-muted text-muted-foreground rounded hover:bg-muted/80 transition-colors"
					disabled={saving}
				>
					Cancel
				</button>
			</div>

			{#if formContent}
				{@render formContent()}
			{/if}

			{#if form}
				<BasicForm {form} />
			{/if}
		</div>
	{/if}
</div>
