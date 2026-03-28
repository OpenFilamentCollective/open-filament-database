<script lang="ts">
	let { certifications }: { certifications: string[] } = $props();
</script>

<div class="flex flex-wrap gap-2">
	{#each certifications as cert}
		<span class="px-2 py-1 bg-primary/10 text-primary rounded text-sm">{cert}</span>
	{/each}
</div>
