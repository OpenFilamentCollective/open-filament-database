<script lang="ts">
	import { SLICER_LABELS } from '$lib/config/slicerConfig';

	let { settings }: { settings: Record<string, any> } = $props();
</script>

<div class="space-y-2">
	{#each Object.entries(settings) as [slicerKey, slicerSettings]}
		<div class="bg-muted/50 rounded p-2">
			<div class="font-medium text-sm">{SLICER_LABELS[slicerKey as keyof typeof SLICER_LABELS] || slicerKey}</div>
			<div class="text-xs text-muted-foreground mt-1 space-y-0.5">
				{#each Object.entries(slicerSettings as Record<string, any>) as [key, value]}
					{#if value !== undefined && value !== null && value !== ''}
						<div>
							<span class="font-medium">{key}:</span>
							{typeof value === 'object' ? JSON.stringify(value) : value}
						</div>
					{/if}
				{/each}
			</div>
		</div>
	{/each}
</div>
