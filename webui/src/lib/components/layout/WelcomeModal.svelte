<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { Modal, Button } from '$lib/components/ui';

	const STORAGE_KEY = 'ofd_welcome_dismissed';
	let show = $state(false);

	onMount(() => {
		if (browser && !localStorage.getItem(STORAGE_KEY)) {
			show = true;
		}
	});

	function dismiss() {
		if (browser) {
			localStorage.setItem(STORAGE_KEY, 'true');
		}
		show = false;
	}
</script>

<Modal {show} title="Welcome to the Open Filament Database" onClose={dismiss} maxWidth="lg">
	<div class="space-y-4">
		<p class="text-sm text-muted-foreground">
			This is a community-driven, open-source database of 3D printing filament information, maintained by the
			<strong class="text-foreground">Open Filament Collective</strong> and facilitated by
			<strong class="text-foreground">SimplyPrint</strong>.
		</p>

		<div class="rounded-lg border bg-muted/30 p-4">
			<h3 class="mb-3 text-sm font-semibold">How to contribute:</h3>
			<ol class="space-y-2 text-sm text-muted-foreground">
				<li class="flex gap-2">
					<span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">1</span>
					<span><strong class="text-foreground">Browse</strong> the existing brands, stores, and filaments</span>
				</li>
				<li class="flex gap-2">
					<span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">2</span>
					<span><strong class="text-foreground">Edit</strong> entries or create new ones using the forms</span>
				</li>
				<li class="flex gap-2">
					<span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">3</span>
					<span><strong class="text-foreground">Submit</strong> your changes &mdash; no GitHub account required</span>
				</li>
				<li class="flex gap-2">
					<span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">4</span>
					<span>A maintainer <strong class="text-foreground">reviews</strong> and merges your contribution</span>
				</li>
			</ol>
		</div>

		<p class="text-xs text-muted-foreground">
			Your edits are saved locally in your browser until you submit them. You can submit anonymously or sign in with GitHub for credit.
		</p>

		<div class="flex justify-end pt-2">
			<Button onclick={dismiss} variant="primary" size="md">
				Got it
			</Button>
		</div>
	</div>
</Modal>
