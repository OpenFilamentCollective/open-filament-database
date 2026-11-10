<script lang="ts">
	/**
	 * One review feedback item (see src/lib/server/feedback.ts): who said it, where, and what.
	 * Bodies are plain text from GitHub; they are shown as text, with line breaks kept and
	 * bare URLs linked, never rendered as HTML.
	 */
	import type { FeedbackItem } from '$lib/types/feedback';

	interface Props {
		item: FeedbackItem;
		/** The contributor changed the field this item is about since loading the PR. */
		changed?: boolean;
		/** Show which entity the item is about (the /submissions page; banners already know). */
		showEntity?: boolean;
		/** The contributor marked it as dealt with. */
		markedDone?: boolean;
		/** When set, a "Mark done" toggle is shown. */
		onToggleDone?: () => void;
		/** Pinned under its field, inside the field's box: no label, no box of its own. */
		compact?: boolean;
	}

	let {
		item,
		changed = false,
		showEntity = false,
		markedDone = false,
		onToggleDone,
		compact = false
	}: Props = $props();

	let addressed = $derived(changed || markedDone);
	/** An addressed item folds to one line unless the contributor opens it again. */
	let expanded = $state(false);
	let collapsed = $derived(addressed && !expanded);

	/** Split text into plain and URL runs so URLs can be links without using {@html}. */
	function runs(text: string): { text: string; href?: string }[] {
		const out: { text: string; href?: string }[] = [];
		const re = /https?:\/\/[^\s<>()[\]"']+[^\s<>()[\]"'.,;:!?]/g;
		let last = 0;
		for (const match of text.matchAll(re)) {
			if (match.index! > last) out.push({ text: text.slice(last, match.index) });
			out.push({ text: match[0], href: match[0] });
			last = match.index! + match[0].length;
		}
		if (last < text.length) out.push({ text: text.slice(last) });
		return out;
	}

	let who = $derived(item.source === 'ai' ? 'Automated review' : item.author);
	let entityName = $derived(item.location?.entityPath?.split('/').at(-1)?.replace(/_/g, ' '));
</script>

<article
	class="text-sm {compact
		? 'border-t border-warning-border p-2.5'
		: 'rounded-md border p-3'} {addressed
		? 'border-border bg-background/60 opacity-75'
		: 'border-warning-border bg-warning-surface text-warning-foreground'}"
>
	<header
		class="{collapsed
			? ''
			: 'mb-1.5'} flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground"
	>
		<span class="font-medium {addressed ? 'text-foreground' : 'text-warning-foreground'}"
			>{who}</span
		>
		{#if item.source === 'ai'}
			<span class="rounded bg-muted px-1.5 py-0.5">unverified</span>
		{/if}
		{#if showEntity && entityName}
			<span>on <span class="font-medium text-foreground">{entityName}</span></span>
		{/if}
		{#if compact}
			<!-- Pinned under its field: the label would repeat it. -->
		{:else if item.location?.label}
			<span
				>· <code class="rounded bg-muted px-1 py-0.5 font-mono">{item.location.label}</code></span
			>
		{:else if item.location && !item.location.entityPath}
			<span
				>· <code class="rounded bg-muted px-1 py-0.5 font-mono">{item.location.repoPath}</code
				></span
			>
		{/if}
		{#if item.outdated}
			<span title="The line this was written about has changed since.">· outdated</span>
		{/if}
		{#if changed}
			<span class="rounded bg-green-500/15 px-1.5 py-0.5 text-green-700 dark:text-green-300"
				>✓ fixed</span
			>
		{:else if markedDone}
			<span class="rounded bg-green-500/15 px-1.5 py-0.5 text-green-700 dark:text-green-300"
				>✓ marked done</span
			>
		{/if}
		{#if onToggleDone && !changed}
			<button
				type="button"
				class="cursor-pointer text-primary hover:underline"
				onclick={onToggleDone}
			>
				{markedDone ? 'Not done' : 'Mark done'}
			</button>
		{/if}
		{#if addressed}
			<button
				type="button"
				class="cursor-pointer text-muted-foreground hover:text-foreground hover:underline"
				aria-expanded={expanded}
				onclick={() => (expanded = !expanded)}
			>
				{expanded ? 'Hide issues' : 'Show issues'}
			</button>
		{/if}
		<a
			href={item.url}
			target="_blank"
			rel="noopener noreferrer"
			class="ml-auto text-primary hover:underline"
		>
			View on GitHub ↗
		</a>
	</header>
	{#if !collapsed && item.context}
		<blockquote class="mb-1.5 border-l-2 pl-2 text-xs text-muted-foreground">
			In reply to {item.context.author === 'github-actions'
				? 'the automated review'
				: item.context.author}: {item.context.excerpt}
		</blockquote>
	{/if}
	{#if !collapsed}
		<p class="break-words whitespace-pre-wrap">
			{#each runs(item.body) as run}{#if run.href}<a
						href={run.href}
						target="_blank"
						rel="noopener noreferrer"
						class="text-primary underline">{run.text}</a
					>{:else}{run.text}{/if}{/each}
		</p>
	{/if}
</article>
