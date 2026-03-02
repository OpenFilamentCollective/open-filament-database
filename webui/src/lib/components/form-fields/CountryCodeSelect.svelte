<script lang="ts">
	import { COUNTRY_CODES, filterCountryCodes, type CountryCode } from '$lib/data/countryCodes';
	import Tooltip from './Tooltip.svelte';
	import { INPUT_CLASSES, LABEL_CLASSES, REQUIRED_INDICATOR } from '$lib/styles/formStyles';

	interface Props {
		value: string;
		label?: string;
		required?: boolean;
		tooltip?: string;
		placeholder?: string;
	}

	let {
		value = $bindable(''),
		label = '',
		required = false,
		tooltip = '',
		placeholder = 'Search country...'
	}: Props = $props();

	let inputEl: HTMLInputElement | null = $state(null);
	let open = $state(false);
	let search = $state('');
	let highlightIndex = $state(0);
	let listEl: HTMLUListElement | null = $state(null);

	let filtered = $derived(filterCountryCodes(search));

	function handleInput(e: Event) {
		const input = e.target as HTMLInputElement;
		search = input.value.toUpperCase();
		input.value = search;
		open = true;
		highlightIndex = 0;
	}

	function select(code: string) {
		value = code;
		search = code;
		open = false;
	}

	function handleFocus() {
		search = value;
		open = true;
		highlightIndex = 0;
	}

	function handleBlur(e: FocusEvent) {
		// Delay close so click on dropdown can register
		const related = e.relatedTarget as HTMLElement | null;
		if (related?.closest('.country-dropdown')) return;
		setTimeout(() => {
			if (search && !COUNTRY_CODES.find((c) => c.code === search)) {
				// Allow free-text entry for codes not in the list
				value = search;
			} else if (!search) {
				value = '';
			}
			open = false;
		}, 150);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (!open) {
			if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
				open = true;
				e.preventDefault();
			}
			return;
		}

		switch (e.key) {
			case 'ArrowDown':
				e.preventDefault();
				highlightIndex = Math.min(highlightIndex + 1, filtered.length - 1);
				scrollIntoView();
				break;
			case 'ArrowUp':
				e.preventDefault();
				highlightIndex = Math.max(highlightIndex - 1, 0);
				scrollIntoView();
				break;
			case 'Enter':
				e.preventDefault();
				if (filtered[highlightIndex]) {
					select(filtered[highlightIndex].code);
				}
				break;
			case 'Escape':
				e.preventDefault();
				open = false;
				break;
		}
	}

	function scrollIntoView() {
		if (listEl) {
			const item = listEl.children[highlightIndex] as HTMLElement | undefined;
			item?.scrollIntoView({ block: 'nearest' });
		}
	}
</script>

<div class="relative flex flex-col">
	{#if label}
		<label class={LABEL_CLASSES}>
			{label}
			{#if required}<span class={REQUIRED_INDICATOR}>*</span>{/if}
			{#if tooltip}<Tooltip text={tooltip} />{/if}
		</label>
	{/if}
	<input
		bind:this={inputEl}
		type="text"
		value={open ? search : value}
		oninput={handleInput}
		onfocus={handleFocus}
		onblur={handleBlur}
		onkeydown={handleKeydown}
		class="{INPUT_CLASSES} uppercase"
		{placeholder}
		maxlength="6"
		autocomplete="off"
	/>
	{#if value && !open}
		{@const match = COUNTRY_CODES.find((c) => c.code === value)}
		{#if match}
			<p class="mt-0.5 text-xs text-muted-foreground">{match.name}</p>
		{/if}
	{/if}
	{#if open && filtered.length > 0}
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<ul
			bind:this={listEl}
			class="country-dropdown absolute left-0 top-full z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-md border bg-popover shadow-md"
			role="listbox"
			onmousedown={(e) => e.preventDefault()}
		>
			{#each filtered as item, i}
				<li
					role="option"
					aria-selected={i === highlightIndex}
					class="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm transition-colors {i === highlightIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'}"
					onmousedown={() => select(item.code)}
					onmouseenter={() => highlightIndex = i}
				>
					<span class="w-12 shrink-0 font-mono font-medium">{item.code}</span>
					<span class="truncate text-muted-foreground">{item.name}</span>
				</li>
			{/each}
		</ul>
	{/if}
</div>
