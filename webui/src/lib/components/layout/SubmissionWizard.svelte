<script lang="ts">
	import { Button, LoadingSpinner } from '$lib/components/ui';
	import { isAuthenticated, currentUser, isSpAuthenticated, currentSpUser, authStore } from '$lib/stores/auth';

	type Step = 'method' | 'details' | 'success';
	type SubmitMethod = 'simplyprint' | 'github';

	interface Props {
		validationStatus: 'idle' | 'running' | 'complete' | 'error';
		validationIsValid: boolean | null;
		validationErrorCount: number;
		validationWarningCount: number;
		onSubmitSimplyPrint: () => Promise<{ success: boolean; message: string; uuid?: string; prUrl?: string }>;
		onSubmitGitHub: (title: string, description: string) => Promise<{ success: boolean; message: string; prUrl?: string }>;
		onClose: () => void;
		initialMethod?: SubmitMethod;
	}

	let {
		validationStatus,
		validationIsValid,
		validationErrorCount,
		validationWarningCount,
		onSubmitSimplyPrint,
		onSubmitGitHub,
		onClose,
		initialMethod
	}: Props = $props();

	let step = $state<Step>(initialMethod ? 'details' : 'method');
	let method = $state<SubmitMethod>(initialMethod ?? 'simplyprint');
	let submitting = $state(false);
	let result = $state<{ success: boolean; message: string; uuid?: string; prUrl?: string } | null>(null);

	// Form fields (GitHub only)
	let prTitle = $state('');
	let prDescription = $state('');

	function selectMethod(m: SubmitMethod) {
		method = m;
		step = 'details';
	}

	function goBack() {
		if (step === 'details') {
			step = 'method';
			result = null;
		}
	}

	async function handleSubmit() {
		submitting = true;
		result = null;

		try {
			if (method === 'simplyprint') {
				result = await onSubmitSimplyPrint();
			} else {
				result = await onSubmitGitHub(prTitle, prDescription);
			}

			if (result?.success) {
				step = 'success';
			}
		} catch (err: any) {
			result = { success: false, message: err.message || 'Submission failed' };
		} finally {
			submitting = false;
		}
	}

	function copyUuid() {
		if (result?.uuid) {
			navigator.clipboard.writeText(result.uuid);
		}
	}

	let hasValidationErrors = $derived(validationStatus === 'complete' && !validationIsValid);
</script>

<div class="flex h-full flex-col">
	{#if step === 'method'}
		<!-- Step 1: Choose submission method -->
		<div class="flex flex-1 flex-col">
			<h4 class="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">How would you like to submit?</h4>

			{#if hasValidationErrors}
				<div class="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
					Please fix validation errors before submitting.
				</div>
			{/if}

			<div class="flex-1 space-y-3">
				<button
					onclick={() => selectMethod('simplyprint')}
					disabled={hasValidationErrors}
					class="w-full cursor-pointer rounded-lg border-2 p-4 text-left transition-colors hover:border-primary/50 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50"
				>
					<div class="flex items-start gap-3">
						<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
							<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
								<path fill-rule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clip-rule="evenodd" />
							</svg>
						</div>
						<div>
							<p class="font-medium">Submit with SimplyPrint</p>
							<p class="mt-0.5 text-sm text-muted-foreground">Sign in with your SimplyPrint account. No GitHub needed.</p>
						</div>
					</div>
				</button>

				<button
					onclick={() => selectMethod('github')}
					disabled={hasValidationErrors}
					class="w-full cursor-pointer rounded-lg border-2 p-4 text-left transition-colors hover:border-primary/50 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50"
				>
					<div class="flex items-start gap-3">
						<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
							<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 16 16" fill="currentColor">
								<path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
							</svg>
						</div>
						<div>
							<p class="font-medium">Submit with GitHub</p>
							<p class="mt-0.5 text-sm text-muted-foreground">Get credit for your contribution on the pull request.</p>
						</div>
					</div>
				</button>
			</div>
		</div>

	{:else if step === 'details'}
		<!-- Step 2: Details -->
		<div class="flex flex-1 flex-col">
			<button
				onclick={goBack}
				class="mb-4 flex cursor-pointer items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
			>
				<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
					<path fill-rule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clip-rule="evenodd" />
				</svg>
				Back
			</button>

			{#if method === 'simplyprint'}
				<h4 class="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">SimplyPrint Submission</h4>

				{#if $isSpAuthenticated}
					<div class="mb-4 flex items-center gap-3">
						<img
							src={$currentSpUser?.avatar_url}
							alt=""
							class="h-8 w-8 shrink-0 rounded-full bg-primary/10"
							onerror={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; (e.currentTarget.nextElementSibling as HTMLElement).style.display = 'flex'; }}
						/>
						<div class="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-bold">
							{$currentSpUser?.name?.charAt(0)?.toUpperCase() || '?'}
						</div>
						<div class="flex-1">
							<p class="text-sm font-medium">{$currentSpUser?.name}</p>
							{#if $currentSpUser?.company_name}
								<p class="text-xs text-muted-foreground">{$currentSpUser.company_name}</p>
							{/if}
						</div>
						<Button onclick={() => authStore.spLogout()} variant="ghost" size="sm" class="text-xs text-muted-foreground">
							Logout
						</Button>
					</div>

					<div class="flex-1 space-y-3">
						<p class="text-sm text-muted-foreground">Your changes will be submitted as a pull request to the database, attributed to your SimplyPrint account. A maintainer will review and merge them.</p>

						<div class="rounded-md border border-muted bg-muted/30 p-3 text-xs text-muted-foreground">
							<p>By submitting, you agree that the email address associated with your SimplyPrint account will be used solely to notify you about the status of this submission (e.g. merged, closed, or changes requested). Your email is stored securely and is not shared with third parties.</p>
						</div>
					</div>

					<div class="mt-4 shrink-0 space-y-3">
						{#if result && !result.success}
							<div class="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
								{result.message}
							</div>
						{/if}
						<Button onclick={handleSubmit} variant="primary" size="md" class="w-full" disabled={submitting}>
							{#if submitting}
								<LoadingSpinner />
								Submitting...
							{:else}
								Submit Changes
							{/if}
						</Button>
					</div>
				{:else}
					<p class="mb-4 text-sm text-muted-foreground">
						Sign in with your SimplyPrint account to submit changes.
					</p>
					<Button onclick={() => authStore.spLogin()} variant="primary" size="md">
						<svg xmlns="http://www.w3.org/2000/svg" class="mr-2 h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
							<path fill-rule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clip-rule="evenodd" />
						</svg>
						Sign in with SimplyPrint
					</Button>
				{/if}

			{:else}
				<!-- GitHub submission -->
				<h4 class="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">GitHub Submission</h4>

				{#if $isAuthenticated}
					<div class="mb-4 flex items-center gap-3">
						{#if $currentUser?.avatar_url}
							<img src={$currentUser.avatar_url} alt={$currentUser.login} class="h-8 w-8 rounded-full" />
						{/if}
						<div class="flex-1">
							<p class="text-sm font-medium">{$currentUser?.name || $currentUser?.login}</p>
							{#if $currentUser?.name}
								<p class="text-xs text-muted-foreground">@{$currentUser.login}</p>
							{/if}
						</div>
						<Button onclick={() => authStore.ghLogout()} variant="ghost" size="sm" class="text-xs text-muted-foreground">
							Logout
						</Button>
					</div>

					<div class="flex-1 space-y-3">
						<div>
							<label for="wizard-pr-title" class="mb-1 block text-sm font-medium">PR Title</label>
							<input
								id="wizard-pr-title"
								type="text"
								bind:value={prTitle}
								class="w-full rounded-md border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
								placeholder="Update filament database..."
							/>
						</div>
						<div>
							<label for="wizard-pr-desc" class="mb-1 block text-sm font-medium">
								Description <span class="font-normal text-muted-foreground">(optional)</span>
							</label>
							<textarea
								id="wizard-pr-desc"
								bind:value={prDescription}
								rows="3"
								class="w-full rounded-md border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
								placeholder="Describe your changes..."
							></textarea>
						</div>
					</div>

					<div class="mt-4 shrink-0 space-y-3">
						{#if result && !result.success}
							<div class="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
								{result.message}
							</div>
						{/if}
						<Button onclick={handleSubmit} variant="primary" size="md" class="w-full" disabled={submitting}>
							{#if submitting}
								<LoadingSpinner />
								Creating Pull Request...
							{:else}
								Create Pull Request
							{/if}
						</Button>
					</div>
				{:else}
					<p class="mb-4 text-sm text-muted-foreground">
						Sign in with GitHub to be credited as the PR author.
					</p>
					<Button onclick={() => authStore.ghLogin()} variant="primary" size="md">
						<svg xmlns="http://www.w3.org/2000/svg" class="mr-2 h-4 w-4" viewBox="0 0 16 16" fill="currentColor">
							<path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
						</svg>
						Sign in with GitHub
					</Button>
				{/if}
			{/if}
		</div>

	{:else if step === 'success'}
		<!-- Step 3: Success -->
		<div class="flex flex-1 flex-col items-center justify-center text-center">
			<div class="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10">
				<svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-green-600 dark:text-green-400" viewBox="0 0 20 20" fill="currentColor">
					<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
				</svg>
			</div>

			<h3 class="mb-2 text-lg font-semibold">Your changes have been submitted!</h3>
			<p class="mb-6 text-sm text-muted-foreground">
				A maintainer will review and merge your changes.
			</p>

			<!-- Flow diagram -->
			<div class="mb-6 flex items-center gap-2 text-sm">
				<div class="flex items-center gap-1.5 rounded-full bg-green-500/10 px-3 py-1 text-green-700 dark:text-green-400">
					<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
						<path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
					</svg>
					Submitted
				</div>
				<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-muted-foreground" viewBox="0 0 20 20" fill="currentColor">
					<path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" />
				</svg>
				<div class="rounded-full bg-muted px-3 py-1 text-muted-foreground">Under Review</div>
				<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-muted-foreground" viewBox="0 0 20 20" fill="currentColor">
					<path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" />
				</svg>
				<div class="rounded-full bg-muted px-3 py-1 text-muted-foreground">Live</div>
			</div>

			{#if result?.uuid}
				<div class="mb-4 flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-xs">
					<span class="text-muted-foreground">Reference:</span>
					<code class="font-mono">{result.uuid}</code>
					<button onclick={copyUuid} class="cursor-pointer text-primary hover:underline" title="Copy UUID">
						<svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
							<path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
							<path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
						</svg>
					</button>
				</div>
			{/if}

			<div class="flex gap-3">
				{#if result?.prUrl}
					<a
						href={result.prUrl}
						target="_blank"
						rel="noopener noreferrer"
						class="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
					>
						View on GitHub
						<svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
							<path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
							<path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
						</svg>
					</a>
				{/if}
				<Button onclick={onClose} variant="primary" size="md">
					Done
				</Button>
			</div>
		</div>
	{/if}
</div>
