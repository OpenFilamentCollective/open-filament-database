<script lang="ts">
	import type { Config } from '@sjsf/form';

	let {
		help,
		config,
		errors
	}: {
		help: string;
		config: Config;
		errors: string[];
	} = $props();
</script>

<p class="text-xs text-muted-foreground italic">{help}</p>
