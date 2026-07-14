<script lang="ts">
	import { untrack } from 'svelte';
	import Tooltip from './Tooltip.svelte';
	import { Button } from '$lib/components/ui';
	import { LABEL_CLASSES, REQUIRED_INDICATOR } from '$lib/styles/formStyles';
	import { stripTrackingParams, hasTrackingParams } from '$lib/utils/urlSanitizer';

	const DEFAULT_PROTOCOL: string = "https://";

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

	let protocol = $state(DEFAULT_PROTOCOL);
	let urlBody = $state('');

	// Whether the current value still carries tracking parameters (drives the "Remove
	// tracking" fix button — e.g. for a dirty value loaded from existing data).
	let hasTracker = $derived(hasTrackingParams(value));
	// Transient confirmation shown right after auto-stripping on paste/blur.
	let cleanedNotice = $state(false);
	let noticeTimer: ReturnType<typeof setTimeout> | undefined;

	function flashCleaned() {
		cleanedNotice = true;
		clearTimeout(noticeTimer);
		noticeTimer = setTimeout(() => (cleanedNotice = false), 2500);
	}

	/** Strip tracking params from the current value and sync the protocol/body inputs. */
	function cleanTracking() {
		const cleaned = stripTrackingParams(value);
		if (cleaned === value) return;
		const parsed = splitUrl(cleaned);
		protocol = parsed.protocol;
		urlBody = parsed.body;
		updateValue();
		flashCleaned();
	}

	// Parse the initial value when it changes externally
	$effect(() => {
		const parsed = splitUrl(value);
		const currentProtocol = untrack(() => protocol);
		const currentBody = untrack(() => urlBody);
		// Only sync protocol from external value when it actually contains one;
		// otherwise an empty value would reset the user's dropdown selection
		if (value && parsed.protocol !== currentProtocol) protocol = parsed.protocol;
		if (parsed.body !== currentBody) urlBody = parsed.body;
	});

	function splitUrl(url: string): { protocol: string; body: string } {
		if (!url) return { protocol: DEFAULT_PROTOCOL, body: '' };
		const match = url.match(/^(https?:\/\/)(.*)/i);
		if (match) {
			return { protocol: match[1].toLowerCase(), body: match[2] };
		}
		// No protocol present - treat as body only
		return { protocol: DEFAULT_PROTOCOL, body: url };
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
</script>

<div class="flex flex-col">
	{#if label}
		<label for={id} class={LABEL_CLASSES}>
			{label}
			{#if required}<span class={REQUIRED_INDICATOR}>*</span>{/if}
			{#if tooltip}<Tooltip text={tooltip} />{/if}
		</label>
	{/if}
	<div class="flex items-center bg-background border border-border rounded-lg focus-within:ring-2 focus-within:ring-ring focus-within:border-ring transition-colors">
		<select
			bind:value={protocol}
			onchange={handleProtocolChange}
			class="bg-transparent border-0 {compact ? 'pl-1.5 pr-6 text-xs' : 'pl-3 pr-6 py-2 text-sm'} text-muted-foreground outline-none cursor-pointer"
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
			class="flex-1 {compact ? 'pr-2 py-1 text-xs' : 'pr-3 py-2 text-sm'} bg-transparent border-0 border-l border-border text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
			{required}
			placeholder={placeholder.replace(/^https?:\/\//i, '')}
		/>
	</div>
	{#if cleanedNotice}
		<p class="mt-1 text-xs text-green-600 dark:text-green-500">Tracking parameters removed.</p>
	{:else if hasTracker}
		<Button
			type="button"
			variant="outline"
			size="sm"
			onclick={cleanTracking}
			title="Strip tracking/affiliate parameters from this link"
			class="mt-1 h-6 self-start border-amber-500/40 px-2 text-xs text-amber-700 dark:text-amber-400"
		>
			Remove trackers
		</Button>
	{/if}
</div>
