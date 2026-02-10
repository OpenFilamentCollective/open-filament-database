<script lang="ts">
	import { SLICER_LABELS } from '$lib/config/slicerConfig';

	let { settings }: { settings: Record<string, any> } = $props();
</script>

<div class="slicer-list">
	{#each Object.entries(settings) as [slicerKey, slicerSettings]}
		<div class="slicer-block">
			<div class="slicer-name text-sm">{SLICER_LABELS[slicerKey as keyof typeof SLICER_LABELS] || slicerKey}</div>
			<div class="slicer-settings dim text-xs">
				{#each Object.entries(slicerSettings as Record<string, any>) as [key, value]}
					{#if value !== undefined && value !== null && value !== ''}
						<div>
							<span class="setting-key">{key}:</span>
							{typeof value === 'object' ? JSON.stringify(value) : value}
						</div>
					{/if}
				{/each}
			</div>
		</div>
	{/each}
</div>

<style>
	.slicer-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.slicer-block {
		background: color-mix(in srgb, var(--adw-fg) 5%, transparent);
		border-radius: var(--adw-border-radius-sm);
		padding: 0.5rem;
	}

	.slicer-name {
		font-weight: 500;
	}

	.slicer-settings {
		margin-top: 0.25rem;
	}

	.slicer-settings > * + * {
		margin-top: 0.125rem;
	}

	.setting-key {
		font-weight: 500;
	}
</style>
