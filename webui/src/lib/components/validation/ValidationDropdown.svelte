<script lang="ts">
	import { errorCount, warningCount, errorsByCategory, validationStore } from '$lib/stores/validationStore';
	import { useValidationPolling } from '$lib/hooks/useValidationPolling';
	import { pathToRoute } from '$lib/utils/pathToRoute';
	import { goto } from '$app/navigation';
	import type { ValidationError } from '$lib/stores/validationStore';
	import { LoadingSpinner } from '$lib/components/ui';
	import ValidationProgressModal from './ValidationProgressModal.svelte';

	let isOpen = $state(false);
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

	function handleModalClose() {
		showModal = false;
		validationStore.setValidating(false);
	}

	function handleErrorClick(error: ValidationError) {
		if (error.path) {
			const route = pathToRoute(error.path);
			goto(route);
			isOpen = false;
		}
	}

	function toggleDropdown() {
		isOpen = !isOpen;
	}

	// Close dropdown when clicking outside
	function handleClickOutside(event: MouseEvent) {
		if (isOpen) {
			const target = event.target as HTMLElement;
			if (!target.closest('.validation-dropdown')) {
				isOpen = false;
			}
		}
	}
</script>

<svelte:window onclick={handleClickOutside} />

<div class="validation-dropdown relative">
	<button
		onclick={toggleDropdown}
		aria-expanded="{isOpen}"
		class="relative px-3 py-2 text-sm font-medium text-foreground/80 dark:text-foreground/80 hover:text-foreground dark:hover:text-foreground transition-colors rounded-md hover:bg-muted dark:hover:bg-muted"
	>
		<span class="flex items-center gap-2">
			{#if $validationStore.isValidating}
				<LoadingSpinner size="md" />
				<span>Validating...</span>
			{:else}
				<span>Validation</span>
			{/if}
		</span>
		{#if $errorCount + $warningCount > 0}
			<span
				class="absolute -top-1 -right-1 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white transform translate-x-1/2 -translate-y-1/2 rounded-full {$errorCount >
				0
					? 'bg-destructive'
					: 'bg-orange-500'}"
			>
				{$errorCount + $warningCount}
			</span>
		{/if}
	</button>

	{#if isOpen}
		<div
			class="absolute right-0 mt-2 w-96 bg-card dark:bg-card rounded-lg shadow-lg border border-border dark:border-border max-h-128 overflow-y-auto z-50"
			role="menu"
			aria-label="Validation results"
		>
			<!-- Run Validation Button -->
			<div class="p-3 border-b border-border dark:border-border bg-muted dark:bg-muted" role="menuitem">
				<button
					onclick={handleRunValidation}
					disabled={$validationStore.isValidating}
					class="bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-md w-full text-sm font-medium flex items-center justify-center gap-2"
				>
					{#if $validationStore.isValidating}
						<LoadingSpinner size="md" />
						<span>Validating...</span>
					{:else}
						<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
							></path>
						</svg>
						<span>Run Validation</span>
					{/if}
				</button>
			</div>

			<!-- Validation Results -->
			{#if $errorCount + $warningCount === 0}
				<div class="p-4 text-center text-green-600 dark:text-green-400" role="menuitem">
					<svg class="w-8 h-8 mx-auto mb-2" fill="currentColor" viewBox="0 0 20 20">
						<path
							fill-rule="evenodd"
							d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
							clip-rule="evenodd"
						/>
					</svg>
					<p class="font-medium">No validation issues</p>
					<p class="text-xs text-muted-foreground dark:text-muted-foreground mt-1">
						All checks passed successfully
					</p>
				</div>
			{:else}
				<div class="divide-y divide-border dark:divide-border" role="menuitem">
					{#each [...$errorsByCategory.entries()] as [category, errors]}
						<div>
							<div class="bg-muted dark:bg-muted px-4 py-2 sticky top-0">
								<h4 class="font-semibold text-sm text-foreground dark:text-foreground">
									{category}
									<span class="text-muted-foreground dark:text-muted-foreground">({errors.length})</span>
								</h4>
							</div>
							<div class="divide-y divide-muted dark:divide-muted">
								{#each errors.slice(0, 5) as error}
									<button
										class="w-full text-left px-4 py-2 hover:bg-muted dark:hover:bg-muted transition-colors {error.level ===
										'ERROR'
											? 'border-l-4 border-destructive'
											: 'border-l-4 border-orange-500'}"
										onclick={() => handleErrorClick(error)}
									>
										<div class="flex items-start gap-2">
											<span class="text-lg shrink-0">
												{error.level === 'ERROR' ? '✗' : '⚠'}
											</span>
											<div class="flex-1 min-w-0">
												<p class="text-sm font-medium text-foreground dark:text-foreground truncate">
													{error.message}
												</p>
												{#if error.path}
													<p class="text-xs text-muted-foreground dark:text-muted-foreground truncate">
														{error.path}
													</p>
												{/if}
											</div>
										</div>
									</button>
								{/each}
								{#if errors.length > 5}
									<div class="px-4 py-2 text-xs text-muted-foreground dark:text-muted-foreground text-center">
										... and {errors.length - 5} more
									</div>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</div>

<ValidationProgressModal
	isOpen={showModal}
	jobId={currentJobId}
	jobType="validation"
	onClose={handleModalClose}
/>
