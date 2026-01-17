<script lang="ts">
	import type { Config } from '@sjsf/form';

	let {
		title,
		templateType,
		config,
		errors
	}: {
		title: string;
		templateType: string;
		config: Config;
		errors: string[];
	} = $props();
</script>

<label class="text-sm font-medium text-foreground" for={config.path.id}>{title}</label>
