<script lang="ts">
	interface Props {
		class?: string;
	}

	let { class: className = 'h-4 w-4' }: Props = $props();
</script>

<svg
	xmlns="http://www.w3.org/2000/svg"
	class={className}
	viewBox="0 0 20 20"
	fill="currentColor"
	aria-hidden="true"
>
	<path
		fill-rule="evenodd"
		d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
		clip-rule="evenodd"
	/>
</svg>
