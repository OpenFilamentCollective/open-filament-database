<script lang="ts">
	import Tooltip from './Tooltip.svelte';
	import { PlusIcon, CloseIcon } from '$lib/components/icons';
	import { LABEL_CLASSES, REQUIRED_INDICATOR } from '$lib/styles/formStyles';
	import { packColorHex, type ColorHexValue } from '$lib/utils/colorHex';

	interface Props {
		/** Single hex string, or an array of them for multi-colour variants. */
		value: ColorHexValue;
		id?: string;
		label?: string;
		required?: boolean;
		tooltip?: string;
	}

	let { value = $bindable(''), id = 'color-hex', label = '', required = false, tooltip = '' }: Props = $props();

	// One row per colour, holding the digits only (the `#` is chrome). Empty entries
	// are kept — a row the user just added has to stay put while they fill it in —
	// and there is always at least one row so an empty field still shows an input.
	let rows = $derived.by(() => {
		const list = Array.isArray(value) ? value : [value];
		const digits = list.map((hex) => (typeof hex === 'string' ? hex.replace(/^#/, '') : ''));
		return digits.length > 0 ? digits : [''];
	});

	// A row the user has started but not finished — flagged inline, blocks submit.
	let incompleteCount = $derived(rows.filter((hex) => hex.length > 0 && hex.length < 6).length);
	// An extra row that was added but never filled in.
	let hasEmptyRow = $derived(rows.length > 1 && rows.some((hex) => hex.length === 0));

	/** Write rows back in the canonical shape: string for one colour, array for many. */
	function commit(next: string[]) {
		value = packColorHex(next.map((hex) => (hex ? `#${hex}` : '')));
	}

	/** Strip the `#` prefix and any non-hex characters, then cap at 6 digits. */
	function clean(raw: string): string {
		return raw.replace(/[^0-9a-fA-F]/g, '').slice(0, 6).toUpperCase();
	}

	function setRow(index: number, raw: string) {
		const next = [...rows];
		next[index] = clean(raw);
		commit(next);
	}

	function handleTextInput(index: number, e: Event) {
		setRow(index, (e.target as HTMLInputElement).value);
	}

	function handlePaste(index: number, e: ClipboardEvent) {
		e.preventDefault();
		setRow(index, e.clipboardData?.getData('text') ?? '');
	}

	function handleColorPicker(index: number, e: Event) {
		setRow(index, (e.target as HTMLInputElement).value);
	}

	function addColor() {
		commit([...rows, '']);
	}

	function removeColor(index: number) {
		commit(rows.filter((_, i) => i !== index));
	}

	/** The picker needs a complete value; incomplete rows fall back to black. */
	function pickerValue(hex: string): string {
		return /^[0-9a-fA-F]{6}$/.test(hex) ? `#${hex}` : '#000000';
	}

	function rowId(index: number): string {
		return index === 0 ? id : `${id}-${index}`;
	}
</script>

<div class="flex flex-col">
	{#if label}
		<label for={id} class={LABEL_CLASSES}>
			{label}
			{#if required}<span class={REQUIRED_INDICATOR}>*</span>{/if}
			{#if tooltip}<Tooltip text={tooltip} />{/if}
		</label>
	{/if}
	<div class="flex flex-col gap-2">
		{#each rows as hex, index (index)}
			{@const isIncomplete = hex.length > 0 && hex.length < 6}
			<div class="flex gap-2">
				<div class="flex flex-1 items-center bg-background border rounded-lg transition-colors {isIncomplete ? 'border-destructive ring-1 ring-destructive' : 'border-border'} focus-within:ring-2 focus-within:ring-ring focus-within:border-ring">
					<span class="pl-3 pr-3 text-muted-foreground font-mono select-none">#</span>
					<input
						id={rowId(index)}
						type="text"
						value={hex}
						oninput={(e) => handleTextInput(index, e)}
						onpaste={(e) => handlePaste(index, e)}
						class="flex-1 pr-3 py-2 bg-transparent border-0 border-l border-border text-foreground font-mono outline-none uppercase"
						placeholder="FF5733"
						maxlength="6"
						aria-label={rows.length > 1 ? `Color ${index + 1} hex` : undefined}
					/>
				</div>
				<input
					type="color"
					value={pickerValue(hex)}
					oninput={(e) => handleColorPicker(index, e)}
					class="w-10 h-10 cursor-pointer shrink-0 rounded-md border border-border bg-background [&::-webkit-color-swatch-wrapper]:p-1 [&::-webkit-color-swatch]:rounded [&::-webkit-color-swatch]:border-none [&::-moz-color-swatch]:rounded [&::-moz-color-swatch]:border-none"
					aria-label={rows.length > 1 ? `Color ${index + 1} picker` : 'Color picker'}
				/>
				{#if index === 0}
					<button
						type="button"
						onclick={addColor}
						class="w-10 h-10 flex items-center justify-center shrink-0 rounded-md border border-dashed border-border bg-background text-muted-foreground hover:text-foreground hover:border-ring focus:outline-none focus:ring-2 focus:ring-ring"
						title="Add another color (for multi-color filaments)"
						aria-label="Add another color"
					>
						<PlusIcon class="h-4 w-4" />
					</button>
				{:else}
					<button
						type="button"
						onclick={() => removeColor(index)}
						class="w-10 h-10 flex items-center justify-center shrink-0 rounded-md border border-border bg-background text-muted-foreground hover:text-destructive hover:border-destructive focus:outline-none focus:ring-2 focus:ring-ring"
						title="Remove this color"
						aria-label="Remove color {index + 1}"
					>
						<CloseIcon class="h-4 w-4" />
					</button>
				{/if}
			</div>
		{/each}
	</div>
	{#if incompleteCount > 0}
		<p class="text-sm text-destructive mt-1">
			{incompleteCount > 1 ? 'Each color hex' : 'Color hex'} must be exactly 6 characters
		</p>
	{:else if hasEmptyRow}
		<p class="text-sm text-destructive mt-1">Fill in or remove the empty color</p>
	{/if}
	{#if rows.length > 1}
		<p class="text-xs text-muted-foreground mt-1">
			Multi-color variant — the first color is the primary one.
		</p>
	{/if}
</div>
