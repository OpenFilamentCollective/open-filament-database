<script lang="ts">
	import type { Sustainability } from '$lib/types/database';
	import type { JsonSchema } from '$lib/utils/sustainability';
	import SustainabilityEditor from '../SustainabilityEditor.svelte';

	let { schema, initial = {} }: { schema: JsonSchema; initial?: Sustainability } = $props();
	let value = $state<Sustainability>(initial);
</script>

<SustainabilityEditor bind:value {schema} />
<pre data-testid="value">{JSON.stringify(value)}</pre>
