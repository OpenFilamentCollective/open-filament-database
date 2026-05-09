<script lang="ts">
	import type { Snippet } from 'svelte';
	import { fade } from 'svelte/transition';
	import Button from './Button.svelte';

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

	// Backdrop close requires a confirmation click to prevent accidental dismissal.
	// First backdrop click arms a short window; a second click within it closes.
	const CONFIRM_WINDOW_MS = 2500;
	let confirmingClose = $state(false);
	let confirmTimer: ReturnType<typeof setTimeout> | null = null;

	function clearConfirmTimer() {
		if (confirmTimer !== null) {
			clearTimeout(confirmTimer);
			confirmTimer = null;
		}
	}

	function handleBackdropClick(event: MouseEvent) {
		if (event.target !== event.currentTarget) return;
		if (confirmingClose) {
			clearConfirmTimer();
			confirmingClose = false;
			onClose();
			return;
		}
		confirmingClose = true;
		clearConfirmTimer();
		confirmTimer = setTimeout(() => {
			confirmingClose = false;
			confirmTimer = null;
		}, CONFIRM_WINDOW_MS);
	}

	// Reset confirmation state whenever the modal closes (via X, Escape, or programmatic).
	$effect(() => {
		if (!show) {
			clearConfirmTimer();
			confirmingClose = false;
		}
	});

	// Only listen for Escape when this modal is shown
	$effect(() => {
		if (!show) return;
		function handleKeydown(e: KeyboardEvent) {
			if (e.key === 'Escape') onClose();
		}
		window.addEventListener('keydown', handleKeydown);
		return () => window.removeEventListener('keydown', handleKeydown);
	});
</script>

{#if show}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<!-- Backdrop with light transparent overlay and click-to-close -->
	<div
		class="fixed inset-0 bg-background/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm"
		onclick={handleBackdropClick}
		role="presentation"
	>
		{#if confirmingClose}
			<div
				class="absolute top-6 left-1/2 -translate-x-1/2 bg-popover text-foreground border border-border text-sm px-3 py-1.5 rounded-full shadow-lg pointer-events-none"
				aria-live="polite"
				transition:fade={{ duration: 150 }}
			>
				Click outside again to close
			</div>
		{/if}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<!-- Modal content - stops propagation to prevent closing when clicking inside -->
		<div
			class="bg-card rounded-lg shadow-xl {maxWidthClasses[maxWidth]} w-full max-h-[90vh] {heightClasses[height]} flex flex-col {contentClass}"
			onclick={(e) => e.stopPropagation()}
			role="dialog"
			aria-modal="true"
			aria-labelledby="modal-title"
			tabindex="-1"
		>
			<div class="flex flex-col flex-1 min-h-0">
				<div class="flex justify-between items-center px-6 pt-6 pb-4 flex-shrink-0">
					<h3 id="modal-title" class="text-xl font-semibold">{title}</h3>
					<Button onclick={onClose} variant="ghost" size="icon" title="Close modal">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-6 w-6"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</Button>
				</div>

				<div class="flex-1 overflow-auto min-h-0 px-6 pb-6">
					{@render children()}
				</div>
			</div>
		</div>
	</div>
{/if}
