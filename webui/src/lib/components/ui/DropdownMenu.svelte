<script lang="ts">
	import type { Snippet } from 'svelte';
	import Button from './Button.svelte';

	export interface DropdownItem {
		label: string;
		onClick: () => void;
		icon?: Snippet;
		disabled?: boolean;
		destructive?: boolean;
		hidden?: boolean;
	}

	interface Props {
		items: (DropdownItem | 'separator')[];
		align?: 'left' | 'right';
		buttonVariant?: 'primary' | 'secondary' | 'ghost' | 'outline';
		buttonLabel?: Snippet;
	}

	let { items, align = 'right', buttonVariant = 'ghost', buttonLabel }: Props = $props();

	let open = $state(false);
	let menuRef: HTMLDivElement | null = $state(null);
	let buttonRef: HTMLButtonElement | null = $state(null);

	function toggle() {
		open = !open;
	}

	function close() {
		open = false;
	}

	function handleItemClick(item: DropdownItem) {
		if (item.disabled) return;
		close();
		item.onClick();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			close();
			buttonRef?.focus();
		}
	}

	function handleClickOutside(e: MouseEvent) {
		if (!open) return;
		const target = e.target as Node;
		if (menuRef && !menuRef.contains(target) && buttonRef && !buttonRef.contains(target)) {
			close();
		}
	}

	// Visible items (filter hidden + strip leading/trailing/double separators)
	const visibleItems = $derived.by(() => {
		const filtered = items.filter((item) => item === 'separator' || !item.hidden);
		const result: (DropdownItem | 'separator')[] = [];
		for (let i = 0; i < filtered.length; i++) {
			const item = filtered[i];
			if (item === 'separator') {
				// Skip leading, trailing, and consecutive separators
				if (result.length === 0) continue;
				if (i === filtered.length - 1) continue;
				if (result[result.length - 1] === 'separator') continue;
			}
			result.push(item);
		}
		// Remove trailing separator
		if (result.length > 0 && result[result.length - 1] === 'separator') result.pop();
		return result;
	});
</script>

<svelte:window onclick={handleClickOutside} onkeydown={handleKeydown} />

<div class="relative inline-block">
	<Button
		bind:ref={buttonRef}
		variant={buttonVariant}
		size="icon"
		onclick={toggle}
		title="More actions"
		class="hover:bg-muted-foreground/10 active:bg-muted-foreground/20 transition-colors {open ? 'bg-muted-foreground/15' : ''}"
	>
		{#if buttonLabel}
			{@render buttonLabel()}
		{:else}
			<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
				<path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
			</svg>
		{/if}
	</Button>

	{#if open}
		<div
			bind:this={menuRef}
			class="absolute z-50 mt-1 min-w-[200px] rounded-md border bg-popover py-1 shadow-lg
				{align === 'right' ? 'right-0' : 'left-0'}"
			role="menu"
		>
			{#each visibleItems as item, i}
				{#if item === 'separator'}
					<div class="my-1 border-t border-border"></div>
				{:else}
					<button
						role="menuitem"
						class="flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors rounded-sm mx-0
							{item.disabled
								? 'cursor-not-allowed opacity-40'
								: item.destructive
									? 'text-destructive hover:bg-destructive/10 active:bg-destructive/20 cursor-pointer'
									: 'text-foreground hover:bg-accent active:bg-accent/80 cursor-pointer'}"
						disabled={item.disabled}
						onclick={() => handleItemClick(item)}
					>
						{#if item.icon}
							<span class="h-4 w-4 shrink-0">
								{@render item.icon()}
							</span>
						{/if}
						{item.label}
					</button>
				{/if}
			{/each}
		</div>
	{/if}
</div>
