<script lang="ts">
	interface Props {
		checked: boolean;
		id?: string;
		disabled?: boolean;
		class?: string;
		onchange?: () => void;
	}

	let {
		checked = $bindable(false),
		id,
		disabled = false,
		class: className = '',
		onchange
	}: Props = $props();
</script>

<button
	type="button"
	role="switch"
	aria-checked={checked}
	{id}
	{disabled}
	onclick={() => {
		if (!disabled) {
			checked = !checked;
			onchange?.();
		}
	}}
	class="peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 {checked
		? 'bg-primary'
		: 'bg-muted-foreground/30'} {className}"
>
	<span
		class="pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform {checked
			? 'translate-x-5'
			: 'translate-x-0'}"
	/>
</button>
