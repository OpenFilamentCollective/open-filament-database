<script lang="ts">
	import { onMount } from 'svelte';
	import { db } from '$lib/services/database';
	import type { Store } from '$lib/types/database';
	import { INPUT_XS_CLASSES, LABEL_COMPACT_CLASSES } from '$lib/styles/formStyles';

	interface Props {
		value: string;
		stores?: Store[];
		id?: string;
		label?: string;
		required?: boolean;
		class?: string;
	}

	let {
		value = $bindable(''),
		stores: providedStores,
		id = 'store-select',
		label = 'Store',
		required = false,
		class: className = ''
	}: Props = $props();

	let localStores: Store[] = $state([]);
	let loading = $state(true);

	// Use provided stores or load them
	let storesList = $derived(providedStores ?? localStores);

	onMount(async () => {
		if (!providedStores) {
			try {
				localStores = await db.loadStores();
			} catch (e) {
				console.error('Failed to load stores:', e);
			}
		}
		loading = false;
	});
</script>

<div class={className}>
	{#if label}
		<label for={id} class={LABEL_COMPACT_CLASSES}>
			{label}
			{#if required}<span class="text-destructive">*</span>{/if}
		</label>
	{/if}
	<select {id} bind:value class={INPUT_XS_CLASSES} disabled={loading && !providedStores}>
		{#if loading && !providedStores}
			<option value="">Loading stores...</option>
		{:else}
			<option value="">Select store...</option>
			{#each storesList as store}
				<option value={store.id}>{store.name}</option>
			{/each}
		{/if}
	</select>
</div>
