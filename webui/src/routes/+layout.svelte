<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { ChangesMenu } from '$lib/components/layout';
	import { Button } from '$lib/components/ui';
	import { isLocalMode, isCloudMode } from '$lib/stores/environment';
	import { authStore } from '$lib/stores/auth';
	import { theme } from '$lib/stores/theme';
	import { db } from '$lib/services/database';
	import { page } from '$app/stores';
	import { env } from '$env/dynamic/public';
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';

	let { children } = $props();

	let refreshing = $state(false);
	let themeMenuOpen = $state(false);

	onMount(() => {
		if (get(isCloudMode)) {
			authStore.checkStatus();
		}
	});

	async function handleRefresh() {
		refreshing = true;
		try {
			// Clear the database cache
			db.clearCache();
			// Reload the current page
			window.location.reload();
		} finally {
			refreshing = false;
		}
	}

	function setTheme(newTheme: 'light' | 'dark' | 'system') {
		theme.setTheme(newTheme);
	}

	function handleClickOutside(event: MouseEvent) {
		const target = event.target as HTMLElement;
		if (!target.closest('.theme-menu')) {
			themeMenuOpen = false;
		}
	}
</script>

<svelte:window onclick={handleClickOutside} onkeydown={(e) => { if (e.key === 'Escape' && themeMenuOpen) themeMenuOpen = false; }} />

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<div class="flex min-h-screen flex-col">
	<!-- Header -->
	<header class="border-b bg-background">
		<div class="container mx-auto flex items-center justify-between px-6 py-4">
			<!-- Left: App title and navigation -->
			<div class="flex items-center gap-8">
				<a href="/" class="text-lg font-bold tracking-tight text-foreground transition-colors hover:text-muted-foreground">
					Filament Database
				</a>
				<!-- Navigation -->
				<nav class="flex items-center gap-1">
					<a
						href="/brands"
						class="rounded-md px-3 py-2 text-sm font-medium transition-colors {$page.url.pathname.startsWith('/brands') ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}"
					>
						Brands
					</a>
					<a
						href="/stores"
						class="rounded-md px-3 py-2 text-sm font-medium transition-colors {$page.url.pathname.startsWith('/stores') ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}"
					>
						Stores
					</a>
					<a
						href="/faq"
						class="rounded-md px-3 py-2 text-sm font-medium transition-colors {$page.url.pathname === '/faq' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}"
					>
						FAQ
					</a>
					<a
						href={env.PUBLIC_API_BASE_URL}
						class="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
					>
						API
					</a>
				</nav>
			</div>
			<!-- Right: Action buttons -->
			<div class="flex items-center gap-2">
				<!-- Theme dropdown menu -->
				<div class="theme-menu relative">
					<Button
						onclick={(e) => { e.stopPropagation(); themeMenuOpen = !themeMenuOpen; }}
						variant="ghost"
						size="icon"
						title="Change theme"
					>
						{#if $theme === 'light'}
							<!-- Sun icon -->
							<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
								<path fill-rule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clip-rule="evenodd" />
							</svg>
						{:else if $theme === 'dark'}
							<!-- Moon icon -->
							<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
								<path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
							</svg>
						{:else}
							<!-- Computer/System icon -->
							<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
								<path fill-rule="evenodd" d="M3 5a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2h-2.22l.123.489.804.804A1 1 0 0113 18H7a1 1 0 01-.707-1.707l.804-.804L7.22 15H5a2 2 0 01-2-2V5zm5.771 7H5V5h10v7H8.771z" clip-rule="evenodd" />
							</svg>
						{/if}
					</Button>

					{#if themeMenuOpen}
						<div class="absolute right-0 z-50 mt-2 w-56 rounded-lg border bg-popover p-3 shadow-md">
							<p class="mb-3 text-xs text-muted-foreground">Choose how the interface looks to you</p>
							<div class="grid grid-cols-3 gap-2">
								<button
									onclick={() => setTheme('light')}
									class="flex flex-col items-center gap-2 rounded-md border-2 px-2 py-3 text-xs transition-colors {$theme === 'light' ? 'border-primary bg-primary/10 text-primary' : 'border-input bg-background hover:bg-accent hover:text-accent-foreground'}"
								>
									<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
										<path fill-rule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clip-rule="evenodd" />
									</svg>
									Light
								</button>
								<button
									onclick={() => setTheme('dark')}
									class="flex flex-col items-center gap-2 rounded-md border-2 px-2 py-3 text-xs transition-colors {$theme === 'dark' ? 'border-primary bg-primary/10 text-primary' : 'border-input bg-background hover:bg-accent hover:text-accent-foreground'}"
								>
									<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
										<path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
									</svg>
									Dark
								</button>
								<button
									onclick={() => setTheme('system')}
									class="flex flex-col items-center gap-2 rounded-md border-2 px-2 py-3 text-xs transition-colors {$theme === 'system' ? 'border-primary bg-primary/10 text-primary' : 'border-input bg-background hover:bg-accent hover:text-accent-foreground'}"
								>
									<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
										<path fill-rule="evenodd" d="M3 5a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2h-2.22l.123.489.804.804A1 1 0 0113 18H7a1 1 0 01-.707-1.707l.804-.804L7.22 15H5a2 2 0 01-2-2V5zm5.771 7H5V5h10v7H8.771z" clip-rule="evenodd" />
									</svg>
									System
								</button>
							</div>
						</div>
					{/if}
				</div>

				{#if $isLocalMode}
					<Button
						onclick={handleRefresh}
						disabled={refreshing}
						variant="ghost"
						size="icon"
						title="Refresh data from filesystem"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-5 w-5 {refreshing ? 'animate-spin' : ''}"
							viewBox="0 0 20 20"
							fill="currentColor"
						>
							<path
								fill-rule="evenodd"
								d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"
								clip-rule="evenodd"
							/>
						</svg>
					</Button>
				{:else}
					<ChangesMenu />
				{/if}
			</div>
		</div>
	</header>

	<main class="flex-1">
		{@render children()}
	</main>
</div>
