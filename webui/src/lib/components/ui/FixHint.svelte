<script lang="ts">
	/**
	 * Inline guidance banner with an optional one-click fix.
	 *
	 * Every data-quality nudge in the forms renders through this: the redundant-material-token
	 * notice, the folder-id drift notice, purchase-link host mismatch, tracker removal, and the
	 * checks mirrored from `ofd/validation/data_quality.py`. Nudges never edit the form value on
	 * their own — the user always presses `fixLabel`.
	 *
	 * `message` covers the common case; pass a `children` snippet instead when the text needs
	 * inline markup (e.g. bolded hosts).
	 */
	import type { Snippet } from 'svelte';
	import Button from './Button.svelte';

	interface Props {
		/** Severity. `error` reads as blocking, `warn` as "should fix", `info` as context. */
		level?: 'info' | 'warn' | 'error' | 'success';
		/** Plain-text body. Ignored when `children` is supplied. */
		message?: string;
		/** Label for the fix button. Omit to render a message-only banner. */
		fixLabel?: string;
		/** Invoked when the fix button is pressed. */
		onFix?: () => void;
		/** Tooltip for the fix button, explaining what it will change. */
		fixTitle?: string;
		/** Renders an "Open ↗" link before the fix button, for verifying a URL. */
		href?: string;
		/** Label for the link. */
		hrefLabel?: string;
		/** Tighter padding/type, for use inside nested cards (sizes, purchase links). */
		compact?: boolean;
		/** Extra classes on the outer element (margins are left to the caller). */
		class?: string;
		children?: Snippet;
	}

	let {
		level = 'warn',
		message = '',
		fixLabel,
		onFix,
		fixTitle,
		href,
		hrefLabel = 'Open ↗',
		compact = false,
		class: className = '',
		children
	}: Props = $props();

	const containerClasses = {
		info: 'bg-primary/10 border-primary/30',
		warn: 'bg-amber-500/10 border-amber-500/30',
		error: 'bg-destructive/10 border-destructive/30',
		success: 'bg-green-500/10 border-green-500/30'
	};

	const textClasses = {
		info: 'text-primary',
		warn: 'text-amber-700 dark:text-amber-400',
		error: 'text-destructive',
		success: 'text-green-700 dark:text-green-500'
	};

	const buttonBorderClasses = {
		info: 'border-primary/40',
		warn: 'border-amber-500/40',
		error: 'border-destructive/40',
		success: 'border-green-500/40'
	};

	const sizeClasses = $derived(compact ? 'p-2.5 text-xs' : 'p-3 text-sm');
	const hasAction = $derived(!!href || (!!fixLabel && !!onFix));
</script>

<div
	class="rounded-md border {containerClasses[level]} {sizeClasses} flex items-start justify-between gap-3 {className}"
>
	<span class={textClasses[level]}>
		{#if children}{@render children()}{:else}{message}{/if}
	</span>

	{#if hasAction}
		<div class="flex shrink-0 items-center gap-1">
			{#if href}
				<a
					{href}
					target="_blank"
					rel="noopener noreferrer"
					class="rounded px-1.5 py-0.5 text-primary hover:underline"
					title="Open this link in a new tab to verify it"
				>
					{hrefLabel}
				</a>
			{/if}
			{#if fixLabel && onFix}
				<Button
					type="button"
					variant="outline"
					size="sm"
					onclick={onFix}
					title={fixTitle}
					class="shrink-0 {buttonBorderClasses[level]} {compact ? 'h-6 px-2 text-xs' : ''}"
				>
					{fixLabel}
				</Button>
			{/if}
		</div>
	{/if}
</div>
