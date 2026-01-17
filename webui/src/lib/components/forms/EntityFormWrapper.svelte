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
		editButtonClass = 'px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors',
		deleteButtonClass = 'px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors',
		children,
		formContent
	}: Props = $props();
</script>

<div class="bg-white border border-gray-200 rounded-lg p-6">
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
					class="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 transition-colors"
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
