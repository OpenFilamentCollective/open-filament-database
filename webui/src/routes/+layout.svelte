<script lang="ts">
	import './layout.css';
	import { ChangesMenu, Footer, WelcomeModal, DebugOverlay } from '$lib/components/layout';
	import { Button, SearchBar } from '$lib/components/ui';
	import { isCloudMode } from '$lib/stores/environment';
	import { authStore } from '$lib/stores/auth';
	import { theme } from '$lib/stores/theme';
	import { isSpAuthenticated, currentSpUser } from '$lib/stores/auth';
	import { isEmbedded, embedThemeOverride, initEmbedFromUrl } from '$lib/stores/embed';
	import { startEmbedBridge, applyEmbedTheme } from '$lib/services/embedBridge';
	import { db } from '$lib/services/database';
	import { clearSearchCache } from '$lib/services/searchIndex';
	import { clearLocalDataExceptSettings } from '$lib/services/localData';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import { loadTraitConfig } from '$lib/config/traitConfig';
	import { loadSlicerConfig } from '$lib/config/slicerConfig';

	let { children } = $props();

	// Detect + sustain embed mode from the URL (sticky across navigations).
	initEmbedFromUrl($page.url);
	$effect(() => {
		initEmbedFromUrl($page.url);
	});

	// Apply the host-forced theme (e.g. the panel's dark mode) when embedded.
	$effect(() => {
		if ($isEmbedded) applyEmbedTheme($embedThemeOverride);
	});

	let refreshing = $state(false);
	let themeMenuOpen = $state(false);
	let headerQuery = $state('');

	// Reflect the active query when on the search page (so the box shows ?q=).
	$effect(() => {
		if ($page.url.pathname === '/search') {
			headerQuery = $page.url.searchParams.get('q') ?? '';
		}
	});

	function submitSearch(q: string) {
		const trimmed = q.trim();
		if (!trimmed) return;
		goto(`/search?q=${encodeURIComponent(trimmed)}`, { keepFocus: true });
	}

	onMount(() => {
		if (get(isCloudMode)) {
			authStore.checkStatus();
		}
		// Load schema-derived configs in parallel
		loadTraitConfig();
		loadSlicerConfig();

		// When embedded in a host (e.g. the SimplyPrint panel), open the
		// postMessage bridge so the host can drive theme + receive lifecycle
		// signals. Auto-detect an existing SimplyPrint session for the identity chip.
		if (get(isEmbedded)) {
			const teardown = startEmbedBridge();
			authStore.checkSpStatus();
			return teardown;
		}
	});

	function handleRefresh() {
		refreshing = true;
		// Clear cached data
		db.clearCache();
		clearSearchCache();
		// Reload the current page
		window.location.reload();
	}

	function setTheme(newTheme: 'light' | 'dark' | 'system') {
		theme.setTheme(newTheme);
	}

	let clearingLocalData = $state(false);

	async function clearLocalData() {
		const confirmed = confirm(
			'Clear all local data?\n\n' +
				'This permanently removes your pending changes, cached images, submitted-change ' +
				'history, and clipboard from this browser. Your settings (theme) are kept. ' +
				'This cannot be undone.'
		);
		if (!confirmed) return;

		clearingLocalData = true;
		try {
			await clearLocalDataExceptSettings();
		} catch (e) {
			console.error('Failed to clear local data:', e);
		}
		themeMenuOpen = false;
		// Reload so every store re-initialises from the now-cleared storage.
		window.location.reload();
	}

	function handleClickOutside(event: MouseEvent) {
		const target = event.target as HTMLElement;
		if (!target.closest('.theme-menu')) {
			themeMenuOpen = false;
		}
	}
</script>

<svelte:window onclick={handleClickOutside} onkeydown={(e) => { if (e.key === 'Escape' && themeMenuOpen) themeMenuOpen = false; }} />

<div class="flex min-h-screen flex-col">
	<!-- Header -->
	<header class="border-b bg-background">
		<div class="container mx-auto flex items-center gap-4 px-6 py-4">
			<!-- Left: App title and navigation -->
			<div class="flex shrink-0 items-center gap-8">
				{#if !$isEmbedded}
					<a href="/" class="text-lg font-bold tracking-tight text-foreground transition-colors hover:text-muted-foreground">
						Filament Database
					</a>
				{/if}
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
						href="/docs"
						class="rounded-md px-3 py-2 text-sm font-medium transition-colors {$page.url.pathname.startsWith('/docs') ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}"
					>
						API
					</a>
				</nav>
			</div>
			<!-- Center: Global search -->
			<div class="flex min-w-0 flex-1 justify-center px-2">
				<div class="w-full max-w-md">
					<SearchBar
						value={headerQuery}
						placeholder="Search filaments, brands…"
						captureKeystrokes={false}
						oninput={(v) => (headerQuery = v)}
						onEnter={submitSearch}
					/>
				</div>
			</div>
			<!-- Right: Action buttons -->
			<div class="flex shrink-0 items-center gap-2">
				{#if $isEmbedded && $isSpAuthenticated && $currentSpUser}
					<!-- Auto-detected SimplyPrint identity -->
					<div
						class="flex items-center gap-2 rounded-full border bg-secondary/50 py-1 pl-1 pr-3 text-xs font-medium text-foreground"
						title="Signed in with SimplyPrint as {$currentSpUser.name}"
					>
						{#if $currentSpUser.avatar_url}
							<img src={$currentSpUser.avatar_url} alt="" class="h-6 w-6 rounded-full object-cover" />
						{:else}
							<span class="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-primary">
								{$currentSpUser.name?.[0]?.toUpperCase() ?? '?'}
							</span>
						{/if}
						<span class="max-w-[10rem] truncate">{$currentSpUser.name}</span>
					</div>
				{/if}
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

							<div class="mt-3 border-t pt-3">
								<button
									onclick={clearLocalData}
									disabled={clearingLocalData}
									class="flex w-full items-center justify-center gap-2 rounded-md border border-destructive/30 px-2 py-2 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50"
									title="Remove pending changes, cached images, and other local data from this browser (keeps your settings)"
								>
									<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
										<path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" />
									</svg>
									{clearingLocalData ? 'Clearing…' : 'Clear local data'}
								</button>
							</div>
						</div>
					{/if}
				</div>

				<Button
					onclick={handleRefresh}
					disabled={refreshing}
					variant="ghost"
					size="icon"
					title="Refresh data"
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
				<ChangesMenu />
			</div>
		</div>
	</header>

	<main class="flex-1">
		{@render children()}
	</main>

	{#if !$isEmbedded}
		<Footer />
	{/if}
</div>

{#if !$isEmbedded}
	<WelcomeModal />
{/if}
<DebugOverlay />
