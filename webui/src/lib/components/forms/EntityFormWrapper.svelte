<script lang="ts">
	import { BasicForm } from '@sjsf/form';
	import type { Snippet } from 'svelte';
	import { Button } from '$lib/components/ui';

	interface Props {
		title: string;
		editMode: boolean;
		saving?: boolean;
		form?: any;
		onEdit: () => void;
		onCancel: () => void;
		onDelete?: () => void;
		editButtonText?: string;
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
					<Button onclick={onEdit} variant="secondary">
						{editButtonText}
					</Button>
					{#if onDelete}
						<Button onclick={onDelete} variant="destructive">
							Delete
						</Button>
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
				<Button onclick={onCancel} variant="secondary" disabled={saving}>
					Cancel
				</Button>
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
