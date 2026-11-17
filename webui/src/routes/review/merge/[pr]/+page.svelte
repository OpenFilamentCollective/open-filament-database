<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, MessageBanner } from '$lib/components/ui';

	let { data, form } = $props();
	let submitting = $state(false);
</script>

<svelte:head>
	<title>Merge #{data.number} - Open Filament Database</title>
</svelte:head>

<div class="container mx-auto max-w-2xl px-6 py-10">
	<h1 class="mb-6 text-2xl font-bold tracking-tight">Review &amp; merge #{data.number}</h1>

	{#if data.forbidden}
		<MessageBanner
			type="error"
			message="Signed in as @{data.login}, who doesn't have write access to the repository. Only maintainers can merge."
		/>
	{:else}
		{@const pr = data.pr}
		{@const checks = data.checks}

		<section class="mb-6 rounded-lg border bg-card p-5">
			<a
				href={pr.html_url}
				target="_blank"
				rel="noopener noreferrer"
				class="text-lg font-semibold hover:underline"
			>
				{pr.title}
			</a>
			<p class="mt-1 text-sm text-muted-foreground">
				by @{pr.author} · {pr.changed_files} files · +{pr.additions} −{pr.deletions}
			</p>
			<p class="mt-3 text-sm">
				{#if checks.failed.length > 0}
					<span class="text-destructive">Failing checks: {checks.failed.join(', ')}</span>
				{:else if checks.pending.length > 0}
					<span class="text-muted-foreground">Still running: {checks.pending.join(', ')}</span>
				{:else}
					<span class="text-green-700 dark:text-green-400">All {checks.passed} checks passed</span>
				{/if}
			</p>
		</section>

		{#if form?.error}
			<MessageBanner type="error" message={form.error} />
		{/if}

		{#if pr.merged}
			<MessageBanner type="success" message="Already merged." />
		{:else if pr.state !== 'open'}
			<MessageBanner type="info" message="This pull request is closed." />
		{:else if pr.draft}
			<MessageBanner type="info" message="This pull request is still a draft." />
		{:else}
			{#each checks.blocking as gate}
				<div class="mb-4 rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
					<strong>{gate.context}</strong> is {gate.state}{gate.description ? `: ${gate.description}` : ''}.
					{#if gate.url}
						<a href={gate.url} target="_blank" rel="noopener noreferrer" class="underline">Details</a>
					{/if}
				</div>
			{/each}
			{#if pr.mergeable === false}
				<MessageBanner type="error" message="GitHub reports conflicts ({pr.mergeable_state}); the merge will likely be refused." />
			{/if}
			<form
				method="POST"
				action="?/merge"
				use:enhance={() => {
					submitting = true;
					return async ({ update }) => {
						await update();
						submitting = false;
					};
				}}
			>
				<input type="hidden" name="sha" value={pr.head_sha} />
				<label for="message" class="mb-2 block text-sm font-medium">
					Comment, posted as @{data.login}
				</label>
				<textarea
					id="message"
					name="message"
					rows="3"
					class="mb-4 w-full rounded-md border bg-background p-3 text-sm"
				>{data.message}</textarea>
				<Button type="submit" disabled={submitting || checks.blocking.length > 0}>
					{submitting ? 'Merging…' : 'LGTM & merge'}
				</Button>
				<p class="mt-2 text-xs text-muted-foreground">
					Merges commit {pr.head_sha.slice(0, 7)} only. If anything is pushed after this
					page loaded, the merge is refused.
				</p>
			</form>
		{/if}
	{/if}
</div>
