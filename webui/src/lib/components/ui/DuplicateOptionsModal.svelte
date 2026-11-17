<script lang="ts">
	import Modal from './Modal.svelte';
	import Button from './Button.svelte';

	export type DuplicateScope = 'entity-only' | 'with-children' | 'with-all';

	interface Props {
		show: boolean;
		onClose: () => void;
		onSelect: (scope: DuplicateScope) => void;
		title?: string;
		/** Description shown when the info tooltip is expanded */
		childrenDescription?: string;
	}

	let {
		show,
		onClose,
		onSelect,
		title = 'Duplicate',
		childrenDescription = 'All nested entries under this item will be duplicated along with it.'
	}: Props = $props();

	let showInfo = $state(false);
</script>

<Modal {show} {title} {onClose} maxWidth="sm">
	<div class="flex items-center gap-2 mb-5">
		<p class="text-sm text-muted-foreground">Include child entries in the duplicate?</p>
		<button
			class="shrink-0 w-5 h-5 rounded-full border border-muted-foreground/30 text-muted-foreground text-xs
				flex items-center justify-center hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
			title="More info"
			onclick={() => showInfo = !showInfo}
		>?</button>
	</div>
	{#if showInfo}
		<div class="mb-4 rounded-md bg-muted/50 border border-border px-3 py-2 text-xs text-muted-foreground">
			{childrenDescription}
		</div>
	{/if}
	<div class="flex flex-col gap-2">
		<Button variant="primary" onclick={() => onSelect('with-children')}>
			With children
		</Button>
		<Button variant="outline" onclick={() => onSelect('entity-only')}>
			Without children
		</Button>
		<Button variant="ghost" onclick={onClose}>
			Cancel
		</Button>
	</div>
</Modal>
