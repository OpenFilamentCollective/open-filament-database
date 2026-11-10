<script lang="ts">
	/**
	 * Where a returned contribution is in its journey, in the style of the front page's
	 * "How Contributing Works": submitted → reviewed → fix → send again → live.
	 */
	interface Props {
		/** The step the contributor is on now. */
		current: 'fix' | 'send';
	}

	let { current }: Props = $props();

	const STEPS = [
		{ key: 'submitted', label: 'Submitted' },
		{ key: 'reviewed', label: 'Reviewed' },
		{ key: 'fix', label: 'Fix' },
		{ key: 'send', label: 'Send again' },
		{ key: 'live', label: 'Live' }
	] as const;

	let currentIndex = $derived(STEPS.findIndex((s) => s.key === current));
</script>

<ol
	class="flex flex-col items-center gap-2 sm:flex-row sm:justify-center sm:gap-0"
	aria-label="Progress"
>
	{#each STEPS as step, i (step.key)}
		{#if i > 0}
			<li aria-hidden="true" class="h-6 w-px shrink-0 bg-border sm:h-px sm:w-8"></li>
		{/if}
		<li
			class="flex flex-col items-center gap-1.5 px-3 py-1"
			aria-current={i === currentIndex ? 'step' : undefined}
		>
			<span
				class="flex h-10 w-10 items-center justify-center rounded-full {i < currentIndex
					? 'bg-green-500/15 text-green-700 dark:text-green-300'
					: i === currentIndex
						? 'border-2 border-warning-border bg-warning-surface text-warning-foreground'
						: 'bg-muted text-muted-foreground'}"
			>
				{#if i < currentIndex}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-5 w-5"
						viewBox="0 0 20 20"
						fill="currentColor"
					>
						<path
							fill-rule="evenodd"
							d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
							clip-rule="evenodd"
						/>
					</svg>
				{:else if step.key === 'fix'}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-5 w-5"
						viewBox="0 0 20 20"
						fill="currentColor"
					>
						<path
							d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"
						/>
					</svg>
				{:else if step.key === 'send'}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-5 w-5"
						viewBox="0 0 20 20"
						fill="currentColor"
					>
						<path
							d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z"
						/>
					</svg>
				{:else}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-5 w-5"
						viewBox="0 0 20 20"
						fill="currentColor"
					>
						<path
							fill-rule="evenodd"
							d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
							clip-rule="evenodd"
						/>
					</svg>
				{/if}
			</span>
			<span
				class="text-sm {i === currentIndex ? 'font-semibold' : 'font-medium text-muted-foreground'}"
				>{step.label}</span
			>
		</li>
	{/each}
</ol>
