<script lang="ts">
	import { environment } from '$lib/stores/environment';
</script>

<div
	class="environment-indicator"
	title={$environment === 'cloud' ? 'Cloud Mode - Changes saved to browser' : 'Local Mode - Changes saved to filesystem'}
>
	{#if $environment === 'cloud'}
		<!-- Cloud icon -->
		<svg
			xmlns="http://www.w3.org/2000/svg"
			class="icon"
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
		>
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="2"
				d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
			/>
		</svg>
	{:else}
		<!-- Computer/Local icon -->
		<svg
			xmlns="http://www.w3.org/2000/svg"
			class="icon"
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
		>
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="2"
				d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
			/>
		</svg>
	{/if}
</div>

<style>
	.environment-indicator {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0.5rem;
		border-radius: 0.375rem;
		cursor: help;
		transition: background-color 0.2s;
		color: #6b7280;
	}

	.environment-indicator:hover {
		background-color: #f3f4f6;
	}

	.icon {
		width: 1.25rem;
		height: 1.25rem;
	}

	/* Dark mode support */
	@media (prefers-color-scheme: dark) {
		.environment-indicator {
			color: #9ca3af;
		}

		.environment-indicator:hover {
			background-color: #374151;
		}
	}
</style>
