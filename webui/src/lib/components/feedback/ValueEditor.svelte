<script lang="ts">
	/**
	 * An entity's data as nested blocks instead of JSON: objects are labelled field rows,
	 * nested objects and lists are boxes inside boxes, and every value is an input of the
	 * right kind. With `compare`, values that differ from `original` are marked, with the
	 * old value and a way back.
	 *
	 * Edits are reported through `onchange(pointer, value, remove?)`; the owner applies them.
	 * `uuid`, `moved_from`, `id` and `slug` are identity, not data, so they are never editable.
	 */
	import type { Snippet } from 'svelte';
	import type { FeedbackItem } from '$lib/types/feedback';
	import { childPointer } from '$lib/utils/jsonPointer';
	import ValueEditor from './ValueEditor.svelte';

	interface Props {
		value: unknown;
		/** What `value` is compared against; undefined when there is nothing to compare to. */
		original?: unknown;
		pointer?: string;
		/** Mark differences from `original`. */
		compare?: boolean;
		readOnly?: boolean;
		/** Smaller type and spacing, e.g. inside the Changes menu. */
		compact?: boolean;
		/** Feedback pinned to a field, rendered right under it. */
		feedbackAt?: (pointer: string) => FeedbackItem[];
		renderFeedback?: Snippet<[FeedbackItem[]]>;
		onchange?: (pointer: string, value: unknown, remove?: boolean) => void;
		/** The contributor's comment on a field, for reviewers; with `onnote`, it can be written. */
		noteAt?: (pointer: string) => string | undefined;
		onnote?: (pointer: string, text: string) => void;
	}

	let {
		value,
		original,
		pointer = '',
		compare = false,
		readOnly = false,
		compact = false,
		feedbackAt = () => [],
		renderFeedback,
		onchange = () => {},
		noteAt = () => undefined,
		onnote
	}: Props = $props();

	/** Fields whose comment box the contributor opened (before typing anything). */
	let opened = $state<string[]>([]);
	let canNote = $derived(!!onnote && !readOnly);
	function noteShown(p: string): boolean {
		return canNote && (!!noteAt(p) || opened.includes(p));
	}
	/** A field with feedback or a comment is drawn as one box, the row on top. */
	function attached(p: string): boolean {
		return (!!renderFeedback && feedbackAt(p).length > 0) || noteShown(p);
	}
	function closeNote(p: string) {
		opened = opened.filter((x) => x !== p);
		onnote?.(p, '');
	}

	const IDENTITY_KEYS = new Set(['uuid', 'moved_from', 'id', 'slug']);
	/** Bookkeeping the contributor never sees or needs: not shown at all. */
	const HIDDEN_KEYS = new Set(['uuid', 'moved_from', 'slug']);

	function isObject(v: unknown): v is Record<string, unknown> {
		return v !== null && typeof v === 'object' && !Array.isArray(v);
	}
	function isContainer(v: unknown): boolean {
		return v !== null && typeof v === 'object';
	}
	function same(a: unknown, b: unknown): boolean {
		return JSON.stringify(a) === JSON.stringify(b);
	}
	function label(key: string | number): string {
		if (typeof key === 'number') return String(key + 1);
		const text = key.replace(/_/g, ' ');
		return text.charAt(0).toUpperCase() + text.slice(1);
	}
	function display(v: unknown): string {
		if (v === null || v === undefined || v === '') return 'empty';
		if (typeof v === 'boolean') return v ? 'yes' : 'no';
		if (isContainer(v))
			return Array.isArray(v) ? `${v.length} item${v.length === 1 ? '' : 's'}` : 'set';
		return String(v);
	}
	/** A short title for a list element: its name, store, or size. */
	function elementTitle(v: unknown, index: number): string {
		if (isObject(v)) {
			if (typeof v.name === 'string' && v.name) return v.name;
			if (typeof v.store_id === 'string' && v.store_id) return v.store_id.replace(/_/g, ' ');
			if (v.filament_weight != null && v.diameter != null)
				return `${v.filament_weight} g · ${v.diameter} mm`;
		}
		return `Item ${index + 1}`;
	}
	/** An empty value of the same shape, for "Add another". */
	function blankLike(v: unknown): unknown {
		if (Array.isArray(v)) return [];
		if (isObject(v)) {
			const out: Record<string, unknown> = {};
			for (const [k, child] of Object.entries(v))
				if (!IDENTITY_KEYS.has(k)) out[k] = blankLike(child);
			return out;
		}
		if (typeof v === 'boolean') return false;
		if (typeof v === 'number') return null;
		return '';
	}
	function parseInput(raw: string, previous: unknown, before: unknown): unknown {
		const kind = typeof (previous ?? before);
		if (kind === 'number') return raw.trim() === '' ? null : Number(raw);
		return raw;
	}

	let keys = $derived.by(() => {
		if (!isObject(value)) return [];
		const own = Object.keys(value).filter((k) => !HIDDEN_KEYS.has(k));
		const gone =
			compare && isObject(original)
				? Object.keys(original).filter((k) => !(k in value) && !HIDDEN_KEYS.has(k))
				: [];
		return [...own, ...gone];
	});
	let originalList = $derived(Array.isArray(original) ? original : []);
	let rowText = $derived(compact ? 'text-xs' : 'text-sm');
</script>

{#snippet marker(v: unknown, o: unknown, p: string, hasOriginal: boolean)}
	{#if compare && hasOriginal && !same(v, o)}
		<span class="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
			<span class="rounded bg-primary/10 px-1.5 py-0.5 font-medium text-primary">changed</span>
			{#if !isContainer(o)}
				<span>was <span class="line-through">{display(o)}</span></span>
			{/if}
			{#if !readOnly}
				<button
					type="button"
					class="cursor-pointer text-primary hover:underline"
					onclick={() => onchange(p, o)}
				>
					Undo
				</button>
			{/if}
		</span>
	{:else if compare && !hasOriginal}
		<span
			class="rounded bg-green-500/15 px-1.5 py-0.5 text-xs font-medium text-green-700 dark:text-green-300"
			>added</span
		>
	{/if}
{/snippet}

{#snippet primitive(v: unknown, o: unknown, p: string, key: string | number, locked: boolean)}
	{@const disabled = readOnly || locked}
	{#if disabled}
		<span
			class="{rowText} break-all {locked ? 'font-mono text-muted-foreground' : ''}"
			title={locked ? 'Identity field: not editable here' : undefined}
		>
			{#if typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)}
				<span
					class="mr-1 inline-block h-3 w-3 rounded-sm border align-middle"
					style="background-color: {v}"
				></span>
			{/if}
			{display(v)}
			{#if locked}<span class="ml-1" aria-hidden="true">🔒</span>{/if}
		</span>
	{:else if typeof v === 'boolean'}
		<input
			type="checkbox"
			checked={v}
			class="h-4 w-4 cursor-pointer"
			onchange={(e) => onchange(p, e.currentTarget.checked)}
		/>
	{:else}
		<span class="flex min-w-0 flex-1 items-center gap-2">
			{#if typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)}
				<input
					type="color"
					value={v}
					class="h-8 w-8 shrink-0 cursor-pointer rounded border bg-transparent"
					onchange={(e) => onchange(p, e.currentTarget.value.toUpperCase())}
				/>
			{/if}
			<input
				type={typeof (v ?? o) === 'number' ? 'number' : 'text'}
				step="any"
				value={v ?? ''}
				placeholder="empty"
				aria-label={label(key)}
				class="w-full min-w-0 rounded-md border bg-background px-2 py-1 {rowText} focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
				onchange={(e) => onchange(p, parseInput(e.currentTarget.value, v, o))}
			/>
			{#if typeof v === 'string' && /^https?:\/\//.test(v)}
				<a
					href={v}
					target="_blank"
					rel="noopener noreferrer"
					class="shrink-0 text-xs text-primary hover:underline">open ↗</a
				>
			{/if}
		</span>
	{/if}
{/snippet}

{#snippet noteButton(p: string)}
	{#if canNote && !noteShown(p)}
		<button
			type="button"
			class="ml-auto cursor-pointer text-xs text-muted-foreground hover:text-primary"
			title="Explain this value to the reviewers"
			onclick={() => (opened = [...opened, p])}
		>
			💬 Comment
		</button>
	{/if}
{/snippet}

{#snippet extras(p: string)}
	{#if renderFeedback}{@render renderFeedback(feedbackAt(p))}{/if}
	{#if noteShown(p)}
		<div class="border-t border-warning-border bg-background/70 p-2.5">
			<div class="mb-1 flex items-center gap-2">
				<label for="note-{p}" class="text-xs font-medium">Your comment for the reviewers</label>
				<button
					type="button"
					class="ml-auto cursor-pointer text-xs text-muted-foreground hover:text-destructive"
					onclick={() => closeNote(p)}
				>
					Remove
				</button>
			</div>
			<textarea
				id="note-{p}"
				rows="2"
				value={noteAt(p) ?? ''}
				placeholder="Explain why it is like this, e.g. the spool label says 25 °C"
				class="w-full rounded-md border bg-background px-2 py-1 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
				onchange={(e) => onnote?.(p, e.currentTarget.value)}
			></textarea>
			<p class="mt-1 text-xs text-muted-foreground">
				The reviewer sees this next to the field when you submit.
			</p>
		</div>
	{/if}
{/snippet}

{#if isObject(value)}
	<div class={compact ? 'space-y-1.5' : 'space-y-2.5'}>
		{#each keys as key (key)}
			{@const p = childPointer(pointer, key)}
			{@const gone = !(key in value)}
			{@const v = value[key]}
			{@const hasOriginal = isObject(original) && key in original}
			{@const o = hasOriginal ? (original as Record<string, unknown>)[key] : undefined}
			{@const locked = IDENTITY_KEYS.has(key)}
			{@const joined = attached(p)}
			<div class={joined ? 'overflow-hidden rounded-md border border-warning-border' : ''}>
				{#if gone}
					<div class="flex flex-wrap items-center gap-2 {rowText}">
						<span class="w-40 shrink-0 text-muted-foreground line-through">{label(key)}</span>
						<span class="text-muted-foreground line-through">{display(o)}</span>
						<span
							class="rounded bg-destructive/10 px-1.5 py-0.5 text-xs font-medium text-destructive"
							>removed</span
						>
						{#if !readOnly}
							<button
								type="button"
								class="cursor-pointer text-xs text-primary hover:underline"
								onclick={() => onchange(p, o)}
							>
								Restore
							</button>
						{/if}
					</div>
				{:else if isContainer(v)}
					<div class="rounded-md border bg-muted/30 {compact ? 'p-2' : 'p-3'}">
						<div class="mb-2 flex flex-wrap items-center gap-2">
							<span class="{rowText} font-semibold">{label(key)}</span>
							{@render marker(v, o, p, hasOriginal)}
						</div>
						{#if locked}
							<span class="font-mono text-xs text-muted-foreground">{JSON.stringify(v)} 🔒</span>
						{:else}
							<ValueEditor
								value={v}
								original={o}
								pointer={p}
								compare={compare && hasOriginal}
								{readOnly}
								{compact}
								{feedbackAt}
								{renderFeedback}
								{onchange}
								{noteAt}
								{onnote}
							/>
						{/if}
					</div>
				{:else}
					<div
						class="flex flex-wrap items-center gap-x-3 gap-y-1 {joined
							? 'bg-warning-surface/50 px-2.5 py-2'
							: ''}"
					>
						<span
							class="{compact ? 'w-28' : 'w-40'} shrink-0 {rowText} {joined
								? 'font-medium text-warning-foreground'
								: 'text-muted-foreground'}">{label(key)}</span
						>
						{@render primitive(v, o, p, key, locked)}
						{@render marker(v, o, p, hasOriginal)}
						{#if !locked}{@render noteButton(p)}{/if}
					</div>
				{/if}
				{@render extras(p)}
			</div>
		{/each}
	</div>
{:else if Array.isArray(value)}
	<div class={compact ? 'space-y-1.5' : 'space-y-2'}>
		{#each value as element, i (i)}
			{@const p = childPointer(pointer, i)}
			{@const hasOriginal = i < originalList.length}
			{@const o = hasOriginal ? originalList[i] : undefined}
			{@const joined = attached(p)}
			<div class={joined ? 'overflow-hidden rounded-md border border-warning-border' : ''}>
				{#if isContainer(element)}
					<div class="rounded-md border bg-card {compact ? 'p-2' : 'p-3'}">
						<div class="mb-2 flex flex-wrap items-center gap-2">
							<span class="{rowText} font-medium">{elementTitle(element, i)}</span>
							{@render marker(element, o, p, hasOriginal)}
							{#if !readOnly}
								<button
									type="button"
									class="ml-auto cursor-pointer text-xs text-muted-foreground hover:text-destructive"
									onclick={() => onchange(p, undefined, true)}
								>
									Remove
								</button>
							{/if}
						</div>
						<ValueEditor
							value={element}
							original={o}
							pointer={p}
							compare={compare && hasOriginal}
							{readOnly}
							{compact}
							{feedbackAt}
							{renderFeedback}
							{onchange}
							{noteAt}
							{onnote}
						/>
					</div>
				{:else}
					<div
						class="flex flex-wrap items-center gap-x-3 gap-y-1 {joined
							? 'bg-warning-surface/50 px-2.5 py-2'
							: ''}"
					>
						{@render primitive(element, o, p, i, false)}
						{@render marker(element, o, p, hasOriginal)}
						{#if !readOnly}
							<button
								type="button"
								class="cursor-pointer text-xs text-muted-foreground hover:text-destructive"
								onclick={() => onchange(p, undefined, true)}
								aria-label="Remove"
							>
								✕
							</button>
						{/if}
						{@render noteButton(p)}
					</div>
				{/if}
				{@render extras(p)}
			</div>
		{/each}
		{#if compare && originalList.length > value.length}
			<p class="text-xs text-muted-foreground">
				{originalList.length - value.length} item{originalList.length - value.length === 1
					? ''
					: 's'} removed
			</p>
		{/if}
		{#if !readOnly}
			<button
				type="button"
				class="cursor-pointer text-xs font-medium text-primary hover:underline"
				onclick={() => onchange(pointer, [...value, blankLike(value.at(-1) ?? '')])}
			>
				+ Add another
			</button>
		{/if}
	</div>
{:else}
	{@render primitive(value, original, pointer, '', false)}
{/if}
