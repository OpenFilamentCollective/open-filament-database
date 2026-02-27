<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		onclick?: (e: MouseEvent) => void;
		onmouseenter?: () => void;
		onmouseleave?: () => void;
		onfocus?: () => void;
		onblur?: () => void;
		variant?: 'primary' | 'secondary' | 'destructive' | 'ghost' | 'outline' | 'link';
		size?: 'sm' | 'md' | 'lg' | 'icon' | 'flex';
		disabled?: boolean;
		active?: boolean;
		class?: string;
		type?: 'button' | 'submit' | 'reset';
		title?: string;
		ref?: HTMLButtonElement | null;
		children: Snippet;
	}

	let {
		onclick,
		onmouseenter,
		onmouseleave,
		onfocus,
		onblur,
		variant = 'primary',
		size = 'md',
		disabled = false,
		active = false,
		class: className = '',
		type = 'button',
		title,
		ref = $bindable(null),
		children
	}: Props = $props();

	const baseClasses =
		'inline-flex items-center justify-center whitespace-nowrap rounded-md font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer';

	const variantClasses = {
		primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
		secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
		destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
		ghost: 'hover:bg-muted hover:text-foreground text-muted-foreground',
		outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
		link: 'text-primary underline-offset-4 hover:underline'
	};

	const sizeClasses = {
		sm: 'h-8 px-3 text-xs gap-1',
		md: 'h-10 px-4 py-2 text-sm gap-2',
		lg: 'h-11 px-8 text-sm gap-2',
		icon: 'h-9 w-9',
		flex: 'px-4 py-2 text-sm gap-2'
	};

	const activeClasses = $derived(active ? 'border-primary bg-primary/10 text-primary' : '');

	const buttonClass = $derived(
		`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${activeClasses} ${className}`
	);
</script>

<button bind:this={ref} {type} {disabled} class={buttonClass} {onclick} {onmouseenter} {onmouseleave} {onfocus} {onblur} {title}>
	{@render children()}
</button>
