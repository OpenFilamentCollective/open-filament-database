<script lang="ts">
	import Tooltip from './Tooltip.svelte';
	import { INPUT_CLASSES, LABEL_CLASSES, BTN_SECONDARY_LG } from '$lib/styles/formStyles';

	interface Props {
		tags: string[];
		label?: string;
		tooltip?: string;
		placeholder?: string;
	}

	let { tags = $bindable([]), label = '', tooltip = '', placeholder = 'Add...' }: Props = $props();
	let newTag = $state('');

	function handleAdd() {
		if (newTag.trim() && !tags.includes(newTag.trim())) {
			tags = [...tags, newTag.trim()];
			newTag = '';
		}
	}

	function handleRemove(tag: string) {
		tags = tags.filter((t: string) => t !== tag);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			handleAdd();
		}
	}
</script>

<div>
	{#if label}
		<label class={LABEL_CLASSES}>
			{label}
			{#if tooltip}<Tooltip text={tooltip} />{/if}
		</label>
	{/if}
	<div class="flex gap-2 mb-2">
		<input
			type="text"
			bind:value={newTag}
			onkeydown={handleKeydown}
			class={INPUT_CLASSES}
			{placeholder}
		/>
		<button type="button" onclick={handleAdd} class={BTN_SECONDARY_LG}>
			Add
		</button>
	</div>
	{#if tags.length > 0}
		<div class="flex flex-wrap gap-2">
			{#each tags as tag}
				<span class="inline-flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary rounded text-sm">
					{tag}
					<button type="button" onclick={() => handleRemove(tag)} class="hover:text-destructive">
						<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
							<path
								fill-rule="evenodd"
								d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
								clip-rule="evenodd"
							/>
						</svg>
					</button>
				</span>
			{/each}
		</div>
	{/if}
</div>
