<script lang="ts">
	import type { Entry, JsonSchema } from '$lib/utils/sustainability';
	import MechanicalEditor from '../MechanicalEditor.svelte';

	let { schema, initial = [] }: { schema: JsonSchema; initial?: Entry[] } = $props();
	let value = $state<Entry[]>(initial);
</script>

<MechanicalEditor bind:value {schema} />
<pre data-testid="value">{JSON.stringify(value)}</pre>
