<script lang="ts">
	import Tooltip from './Tooltip.svelte';
	import { INPUT_CLASSES, LABEL_CLASSES, REQUIRED_INDICATOR } from '$lib/styles/formStyles';

	interface Props {
		value: string;
		id?: string;
		label?: string;
		required?: boolean;
		placeholder?: string;
		tooltip?: string;
		/** Use compact sizing (matches INPUT_XS_CLASSES height) */
		compact?: boolean;
	}

	let {
		value = $bindable(''),
		id = 'url-field',
		label = '',
		required = false,
		placeholder = 'example.com/...',
		tooltip = '',
		compact = false
	}: Props = $props();

	let protocol = $state('https://');
	let urlBody = $state('');

	// Parse the initial value when it changes externally
	$effect(() => {
		const parsed = splitUrl(value);
		// Only sync protocol from external value when it actually contains one;
		// otherwise an empty value would reset the user's dropdown selection
		if (value && parsed.protocol !== protocol) protocol = parsed.protocol;
		if (parsed.body !== urlBody) urlBody = parsed.body;
	});

	function splitUrl(url: string): { protocol: string; body: string } {
		if (!url) return { protocol: 'https://', body: '' };
		const match = url.match(/^(https?:\/\/)(.*)/i);
		if (match) {
			return { protocol: match[1].toLowerCase(), body: match[2] };
		}
		// No protocol present - treat as body only
		return { protocol: 'https://', body: url };
	}

	function updateValue() {
		value = urlBody ? protocol + urlBody : '';
	}

	function handlePaste(e: ClipboardEvent) {
		const pasted = e.clipboardData?.getData('text')?.trim();
		if (!pasted) return;

		const match = pasted.match(/^(https?:\/\/)(.*)/i);
		if (match) {
			e.preventDefault();
			protocol = match[1].toLowerCase();
			urlBody = match[2];
			updateValue();
		}
	}

	function handleInput() {
		// Strip protocol if user typed it into the text field
		const match = urlBody.match(/^(https?:\/\/)(.*)/i);
		if (match) {
			protocol = match[1].toLowerCase();
			urlBody = match[2];
		}
		updateValue();
	}

	function handleProtocolChange() {
		updateValue();
	}

	let selectClasses = $derived(compact
		? 'h-7 rounded-l-md border border-r-0 border-input bg-muted pl-1.5 pr-6 text-xs text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring flex-shrink-0'
		: 'h-10 rounded-l-md border border-r-0 border-input bg-muted pl-2 pr-6 py-2 text-sm text-muted-foreground ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 flex-shrink-0');

	let inputClasses = $derived(compact
		? 'flex h-7 w-full rounded-r-md border border-input bg-background px-2 py-1 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50'
		: 'flex h-10 w-full rounded-r-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50');
</script>

<div class="flex flex-col">
	{#if label}
		<label for={id} class={LABEL_CLASSES}>
			{label}
			{#if required}<span class={REQUIRED_INDICATOR}>*</span>{/if}
			{#if tooltip}<Tooltip text={tooltip} />{/if}
		</label>
	{/if}
	<div class="flex">
		<select
			bind:value={protocol}
			onchange={handleProtocolChange}
			class={selectClasses}
			aria-label="URL protocol"
		>
			<option value="https://">https://</option>
			<option value="http://">http://</option>
		</select>
		<input
			{id}
			type="text"
			bind:value={urlBody}
			oninput={handleInput}
			onpaste={handlePaste}
			class={inputClasses}
			{required}
			placeholder={placeholder.replace(/^https?:\/\//i, '')}
		/>
	</div>
</div>
