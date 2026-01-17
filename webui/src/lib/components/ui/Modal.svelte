<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		show: boolean;
		title: string;
		onClose: () => void;
		maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl' | '6xl' | '7xl';
		height?: 'auto' | '1/2' | '2/3' | '3/4' | 'full';
		contentClass?: string;
		children: Snippet;
	}

	let { show, title, onClose, maxWidth = '2xl', height = 'auto', contentClass = '', children }: Props = $props();

	const maxWidthClasses: Record<string, string> = {
		sm: 'max-w-sm',
		md: 'max-w-md',
		lg: 'max-w-lg',
		xl: 'max-w-xl',
		'2xl': 'max-w-2xl',
		'3xl': 'max-w-3xl',
		'4xl': 'max-w-4xl',
		'5xl': 'max-w-5xl',
		'6xl': 'max-w-6xl',
		'7xl': 'max-w-7xl'
	};

	const heightClasses: Record<string, string> = {
		auto: '',
		'1/2': 'h-[50vh]',
		'2/3': 'h-[66vh]',
		'3/4': 'h-[75vh]',
		full: 'h-[90vh]'
	};

	// Handle click on backdrop to close modal
	function handleBackdropClick(event: MouseEvent) {
		// Only close if clicking directly on the backdrop, not on the modal content
		if (event.target === event.currentTarget) {
			onClose();
		}
	}
</script>

{#if show}
	<!-- Backdrop with light transparent overlay and click-to-close -->
	<div
		class="fixed inset-0 bg-background/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm"
		onclick={handleBackdropClick}
		role="button"
		tabindex="-1"
		aria-label="Close modal"
	>
		<!-- Modal content - stops propagation to prevent closing when clicking inside -->
		<div
			class="bg-card rounded-lg shadow-xl {maxWidthClasses[maxWidth]} w-full max-h-[90vh] {heightClasses[height]} flex flex-col {contentClass}"
			onclick={(e) => e.stopPropagation()}
			role="dialog"
			aria-modal="true"
		>
			<div class="p-6 flex flex-col flex-1 min-h-0">
				<div class="flex justify-between items-center mb-4 flex-shrink-0">
					<h3 class="text-xl font-semibold">{title}</h3>
					<button
						type="button"
						onclick={onClose}
						class="text-muted-foreground hover:text-foreground transition-colors"
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

				<div class="flex-1 overflow-auto min-h-0">
					{@render children()}
				</div>
			</div>
		</div>
	</div>
{/if}
