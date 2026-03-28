<script lang="ts">
	import { onMount } from 'svelte';

	interface Props {
		value: string;
		placeholder?: string;
		oninput: (value: string) => void;
		/** If true, typing anywhere on the page will focus this search bar */
		captureKeystrokes?: boolean;
	}

	let {
		value,
		placeholder = 'Search...',
		oninput,
		captureKeystrokes = true
	}: Props = $props();

	let inputEl: HTMLInputElement | undefined = $state();

	onMount(() => {
		if (!captureKeystrokes) return;

		function handleKeydown(e: KeyboardEvent) {
			// Don't capture if user is typing in another input/textarea/contenteditable
			const target = e.target as HTMLElement;
			if (
				target.tagName === 'INPUT' ||
				target.tagName === 'TEXTAREA' ||
				target.tagName === 'SELECT' ||
				target.isContentEditable
			) {
				// Allow if it's our own input
				if (target === inputEl) return;
				return;
			}

			// Ignore modifier keys and special keys
			if (e.ctrlKey || e.metaKey || e.altKey) return;
			if (e.key === 'Tab' || e.key === 'Escape' || e.key === 'Enter') {
				if (e.key === 'Escape' && value) {
					oninput('');
					inputEl?.blur();
					e.preventDefault();
				}
				return;
			}

			// Only capture printable characters and backspace
			if (e.key === 'Backspace') {
				inputEl?.focus();
				return;
			}

			if (e.key.length === 1) {
				inputEl?.focus();
				// The keydown will naturally type into the now-focused input
			}
		}

		document.addEventListener('keydown', handleKeydown);
		return () => document.removeEventListener('keydown', handleKeydown);
	});
</script>

<div class="relative">
	<svg
		xmlns="http://www.w3.org/2000/svg"
		class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none"
		viewBox="0 0 20 20"
		fill="currentColor"
	>
		<path
			fill-rule="evenodd"
			d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
			clip-rule="evenodd"
		/>
	</svg>
	<input
		bind:this={inputEl}
		type="text"
		{value}
		{placeholder}
		oninput={(e) => oninput(e.currentTarget.value)}
		class="w-full pl-9 pr-8 py-2 text-sm rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
	/>
	{#if value}
		<button
			type="button"
			onclick={() => { oninput(''); inputEl?.focus(); }}
			class="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
			aria-label="Clear search"
		>
			<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
				<path
					fill-rule="evenodd"
					d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
					clip-rule="evenodd"
				/>
			</svg>
		</button>
	{/if}
</div>
