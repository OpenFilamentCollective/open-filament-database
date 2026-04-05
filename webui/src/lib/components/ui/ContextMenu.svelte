<script lang="ts">
	export interface ContextMenuItem {
		label: string;
		onClick: () => void;
		disabled?: boolean;
		hidden?: boolean;
		destructive?: boolean;
	}

	interface Props {
		items: (ContextMenuItem | 'separator')[];
		x: number;
		y: number;
		show: boolean;
		onClose: () => void;
	}

	let { items, x, y, show, onClose }: Props = $props();

	let menuRef: HTMLDivElement | null = $state(null);

	// Adjust position to stay within viewport
	const adjustedPos = $derived.by(() => {
		if (!menuRef || !show) return { x, y };
		const rect = menuRef.getBoundingClientRect();
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		let ax = x;
		let ay = y;
		if (ax + rect.width > vw) ax = vw - rect.width - 8;
		if (ay + rect.height > vh) ay = vh - rect.height - 8;
		if (ax < 0) ax = 8;
		if (ay < 0) ay = 8;
		return { x: ax, y: ay };
	});

	const visibleItems = $derived(
		items.filter((item) => item === 'separator' || !item.hidden)
	);

	function handleItemClick(item: ContextMenuItem) {
		if (item.disabled) return;
		onClose();
		item.onClick();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (show && e.key === 'Escape') {
			onClose();
		}
	}

	function handleClickOutside(e: MouseEvent) {
		if (!show) return;
		const target = e.target as Node;
		if (menuRef && !menuRef.contains(target)) {
			onClose();
		}
	}
</script>

<svelte:window onclick={handleClickOutside} onkeydown={handleKeydown} />

{#if show}
	<div
		bind:this={menuRef}
		class="fixed z-[100] min-w-[180px] rounded-md border bg-popover py-1 shadow-lg"
		style="left: {adjustedPos.x}px; top: {adjustedPos.y}px;"
		role="menu"
	>
		{#each visibleItems as item}
			{#if item === 'separator'}
				<div class="my-1 border-t border-border"></div>
			{:else}
				<button
					role="menuitem"
					class="flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors rounded-sm
						{item.disabled
							? 'cursor-not-allowed opacity-40'
							: item.destructive
								? 'text-destructive hover:bg-destructive/10 active:bg-destructive/20 cursor-pointer'
								: 'text-foreground hover:bg-accent active:bg-accent/80 cursor-pointer'}"
					disabled={item.disabled}
					onclick={() => handleItemClick(item)}
				>
					{item.label}
				</button>
			{/if}
		{/each}
	</div>
{/if}
