<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** Whether data is currently loading */
		loading: boolean;
		/** Error message (if any) */
		error: string | null;
		/** The data to display */
		data: any;
		/** Content to render when data is loaded */
		children: Snippet<[any]>;
		/** Custom error content (optional) */
		errorContent?: Snippet;
		/** Custom loading content (optional) */
		loadingContent?: Snippet;
	}

	let { loading, error, data, children, errorContent, loadingContent }: Props = $props();

	// Check if data is valid (not null/undefined, allows empty arrays)
	const hasData = $derived(data !== null && data !== undefined);
</script>

{#if loading}
	{#if loadingContent}
		{@render loadingContent()}
	{:else}
		<div class="flex justify-center items-center py-12">
			<div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
		</div>
	{/if}
{:else if error && !hasData}
	{#if errorContent}
		{@render errorContent()}
	{:else}
		<div class="bg-red-50 border border-red-200 rounded-lg p-4">
			<p class="text-red-800">Error: {error}</p>
		</div>
	{/if}
{:else if hasData}
	{@render children(data)}
{/if}
