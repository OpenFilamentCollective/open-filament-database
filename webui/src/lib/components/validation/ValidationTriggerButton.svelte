<script lang="ts">
	import { validationStore } from '$lib/stores/validationStore';
	import { useValidationPolling } from '$lib/hooks/useValidationPolling';
	import { LoadingSpinner } from '$lib/components/ui';
	import ValidationProgressModal from './ValidationProgressModal.svelte';

	let showModal = $state(false);
	let currentJobId = $state<string | null>(null);

	const { runValidation } = useValidationPolling();

	async function handleRunValidation() {
		const result = await runValidation();
		if (result) {
			currentJobId = result.jobId;
			showModal = true;
		}
	}

	function handleClose() {
		showModal = false;
		validationStore.setValidating(false);
	}
</script>

<button
	onclick={handleRunValidation}
	class="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
	disabled={$validationStore.isValidating}
>
	{#if $validationStore.isValidating}
		<span class="inline-flex items-center">
			<LoadingSpinner size="md" class="-ml-1 mr-2 text-white" />
			Validating...
		</span>
	{:else}
		Validate
	{/if}
</button>

<ValidationProgressModal
	isOpen={showModal}
	jobId={currentJobId}
	jobType="validation"
	onClose={handleClose}
/>
