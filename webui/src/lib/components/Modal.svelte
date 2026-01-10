<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		show: boolean;
		title: string;
		onClose: () => void;
		maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl';
		children: Snippet;
	}

	let { show, title, onClose, maxWidth = '2xl', children }: Props = $props();

	const maxWidthClasses = {
		sm: 'max-w-sm',
		md: 'max-w-md',
		lg: 'max-w-lg',
		xl: 'max-w-xl',
		'2xl': 'max-w-2xl',
		'3xl': 'max-w-3xl',
		'4xl': 'max-w-4xl'
	};
</script>

{#if show}
	<div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
		<div class="bg-white rounded-lg shadow-xl {maxWidthClasses[maxWidth]} w-full max-h-[90vh] overflow-auto">
			<div class="p-6">
				<div class="flex justify-between items-center mb-4">
					<h3 class="text-xl font-semibold">{title}</h3>
					<button
						type="button"
						onclick={onClose}
						class="text-gray-400 hover:text-gray-600 transition-colors"
						aria-label="Close modal"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-6 w-6"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				</div>

				{@render children()}
			</div>
		</div>
	</div>
{/if}
