<script lang="ts">
	import { LoadingSpinner } from '$lib/components/ui';
	import { ValidationProgressModal } from '$lib/components/validation';

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
	class="bg-green-600 text-white hover:bg-green-700 px-4 py-2 rounded-md text-sm font-medium"
	disabled={isSorting}
>
	{#if isSorting}
		<span class="inline-flex items-center">
			<LoadingSpinner size="md" class="-ml-1 mr-2 text-white" />
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
