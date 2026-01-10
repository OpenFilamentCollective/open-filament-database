<script lang="ts">
	import ValidationProgressModal from './ValidationProgressModal.svelte';

	let showModal = $state(false);
	let currentJobId = $state<string | null>(null);
	let isSorting = $state(false);

	async function runSort(dryRun = false) {
		isSorting = true;

		try {
			const response = await fetch('/api/sort', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ dryRun, runValidation: false })
			});

			if (!response.ok) {
				throw new Error('Failed to start sorting');
			}

			const { jobId } = await response.json();
			currentJobId = jobId;
			showModal = true;
		} catch (error) {
			console.error('Failed to start sorting:', error);
			isSorting = false;
			alert('Failed to start sorting. Please try again.');
		}
	}

	function handleClose() {
		showModal = false;
		isSorting = false;
	}
</script>

<button
	onclick={() => runSort(false)}
	class="px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
	disabled={isSorting}
>
	{#if isSorting}
		<span class="inline-flex items-center">
			<svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
				<circle
					class="opacity-25"
					cx="12"
					cy="12"
					r="10"
					stroke="currentColor"
					stroke-width="4"
				></circle>
				<path
					class="opacity-75"
					fill="currentColor"
					d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
				></path>
			</svg>
			Sorting...
		</span>
	{:else}
		Sort Data (Run before submit)
	{/if}
</button>

<ValidationProgressModal
	isOpen={showModal}
	jobId={currentJobId}
	jobType="sort"
	onClose={handleClose}
/>
