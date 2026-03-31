<script lang="ts">
	import type { Config } from '@sjsf/form';

	let {
		description,
		templateType,
		config,
		errors
	}: {
		description: string;
		templateType: string;
		config: Config;
		errors: string[];
	} = $props();
</script>

<p class="text-sm text-muted-foreground">{description}</p>
