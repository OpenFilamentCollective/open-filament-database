<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { changeStore } from '$lib/stores/changes';
	import { userPrefs } from '$lib/stores/userPrefs';
	import { LoadingSpinner, Button } from '$lib/components/ui';

	const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

	let loading = $state(true);
	let error = $state<string | null>(null);

	onMount(async () => {
		const uuid = $page.params.uuid;

		if (!uuid || !UUID_REGEX.test(uuid)) {
			error = 'Invalid submission reference.';
			loading = false;
			return;
		}

		try {
			const res = await fetch(`/api/anon/deflate/${uuid}`);

			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				if (res.status === 404) {
					error = 'Submission not found. It may have expired or the reference is incorrect.';
				} else if (res.status === 409) {
					error = 'This submission is not awaiting changes. It may have already been merged or closed.';
				} else {
					error = data.error || 'Failed to load changes.';
				}
				loading = false;
				return;
			}

			const data = await res.json();

			await changeStore.importChanges({
				metadata: {
					exportedAt: Date.now(),
					version: '1.0.0',
					changeCount: data.changes.length,
					imageCount: Object.keys(data.images || {}).length
				},
				changes: data.changes,
				images: data.images || {}
			});

			userPrefs.addSubmission(uuid, '', 0);

			goto('/');
		} catch (err: any) {
			error = err.message || 'An unexpected error occurred.';
			loading = false;
		}
	});
</script>

<div class="container mx-auto flex min-h-[60vh] items-center justify-center px-6">
	{#if loading}
		<div class="flex flex-col items-center gap-4 text-center">
			<LoadingSpinner />
			<p class="text-sm text-muted-foreground">Loading your changes...</p>
		</div>
	{:else if error}
		<div class="flex max-w-md flex-col items-center gap-4 text-center">
			<div class="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
				<svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-destructive" viewBox="0 0 20 20" fill="currentColor">
					<path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
				</svg>
			</div>
			<h2 class="text-lg font-semibold">Unable to load changes</h2>
			<p class="text-sm text-muted-foreground">{error}</p>
			<Button onclick={() => goto('/')} variant="primary" size="md">
				Go to Editor
			</Button>
		</div>
	{/if}
</div>
