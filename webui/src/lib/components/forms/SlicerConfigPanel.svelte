<script lang="ts">
	import { BasicForm } from '@sjsf/form';
	import { ToggleField } from '$lib/components/form-fields';
	import {
		SLICER_KEYS,
		SLICER_LABELS,
		SLICER_DESCRIPTIONS,
		type SlicerKey
	} from '$lib/config/slicerConfig';
	import { CARD_CLASSES, CARD_HEADER_CLASSES, DOT_INDICATOR } from '$lib/styles/formStyles';
	import type { Snippet } from 'svelte';

	interface Props {
		slicerEnabled: Record<SlicerKey, boolean>;
		slicerForms: Record<SlicerKey, any>;
		onToggle: (key: SlicerKey) => void;
		/** If provided, renders only the toggles section */
		togglesOnly?: boolean;
		/** If provided, renders only the config panel section */
		panelOnly?: boolean;
		/** Custom empty state icon snippet */
		emptyIcon?: Snippet;
		/** Custom empty state message */
		emptyMessage?: string;
	}

	let {
		slicerEnabled,
		slicerForms,
		onToggle,
		togglesOnly = false,
		panelOnly = false,
		emptyIcon,
		emptyMessage = 'Enable a slicer toggle on the left to configure its settings here.'
	}: Props = $props();

	let hasAnyEnabled = $derived(SLICER_KEYS.some((key) => slicerEnabled[key]));
</script>

{#snippet defaultEmptyIcon()}
	<svg
		xmlns="http://www.w3.org/2000/svg"
		class="h-12 w-12 text-muted-foreground mb-3"
		fill="none"
		viewBox="0 0 24 24"
		stroke="currentColor"
	>
		<path
			stroke-linecap="round"
			stroke-linejoin="round"
			stroke-width="1.5"
			d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
		/>
		<path
			stroke-linecap="round"
			stroke-linejoin="round"
			stroke-width="1.5"
			d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
		/>
	</svg>
{/snippet}

<!-- Toggles section -->
{#if !panelOnly}
	<div class="flex flex-wrap gap-3">
		{#each SLICER_KEYS as key}
			<ToggleField
				bind:checked={slicerEnabled[key]}
				label={SLICER_LABELS[key]}
				tooltip={SLICER_DESCRIPTIONS[key]}
				onchange={() => onToggle(key)}
			/>
		{/each}
	</div>
{/if}

<!-- Config panel section -->
{#if !togglesOnly}
	{#if !panelOnly}
		<!-- Spacer when showing both -->
		<div class="mt-4"></div>
	{/if}
	<h3 class="text-sm font-medium text-foreground mb-3 shrink-0">Slicer Configuration</h3>
	<div class="flex-1 overflow-y-auto space-y-4 pr-1 min-h-0">
		{#if hasAnyEnabled}
			{#each SLICER_KEYS as key}
				{#if slicerEnabled[key]}
					<div class={CARD_CLASSES}>
						<h4 class={CARD_HEADER_CLASSES}>
							<span class={DOT_INDICATOR}></span>
							<span class="truncate">{SLICER_LABELS[key]}</span>
						</h4>
						{#if slicerForms[key]}
							<div class="text-sm">
								<BasicForm form={slicerForms[key]} />
							</div>
						{:else}
							<div class="text-sm text-muted-foreground">Loading...</div>
						{/if}
					</div>
				{/if}
			{/each}
		{:else}
			<div class="flex flex-col items-center justify-center h-full text-center p-4">
				{#if emptyIcon}
					{@render emptyIcon()}
				{:else}
					{@render defaultEmptyIcon()}
				{/if}
				<p class="text-sm text-muted-foreground">{emptyMessage}</p>
			</div>
		{/if}
	</div>
{/if}
