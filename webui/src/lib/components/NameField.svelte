<script lang="ts">
	interface Props {
		value: string;
		id?: string;
		required?: boolean;
		label?: string;
	}

	let { value = $bindable(''), id = 'name-field', required = true, label = 'Name' }: Props = $props();
</script>

<div class="sjsf-field flex flex-col">
	<label for={id} class="font-bold">
		{label}
		{#if required}*{/if}
	</label>
	<input {id} type="text" bind:value />
</div>
