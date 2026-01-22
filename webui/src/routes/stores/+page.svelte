<script lang="ts">
	import { onMount } from 'svelte';
	import type { Store } from '$lib/types/database';
	import { db } from '$lib/services/database';
	import { Modal, MessageBanner } from '$lib/components/ui';
	import { StoreForm } from '$lib/components/forms';
	import { DataDisplay } from '$lib/components/layout';
	import { EntityCard } from '$lib/components/entity';
	import { createMessageHandler } from '$lib/utils/messageHandler.svelte';
	import { createEntityState } from '$lib/utils/entityState.svelte';
	import { generateSlug } from '$lib/services/entityService';
	import { saveLogoImage } from '$lib/utils/logoManagement';
	import { isCloudMode } from '$lib/stores/environment';
	import { changeStore } from '$lib/stores/changes';
	import { BackButton } from '$lib/components';

	let stores: Store[] = $state([]);
	let loading: boolean = $state(true);
	let error: string | null = $state(null);
	let schema: any = $state(null);

	const messageHandler = createMessageHandler();

	const entityState = createEntityState({
		getEntityPath: () => null,
		getEntity: () => null
	});

	const newStore: Store = {
		id: '',
		name: '',
		logo: '',
		storefront_url: '',
		ships_from: [],
		ships_to: []
	};

	async function loadData() {
		loading = true;
		error = null;
		try {
			const index = await db.loadIndex();
			stores = index.stores;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load stores';
		} finally {
			loading = false;
		}
	}

	onMount(loadData);

	// Reload when navigating back to this page
	$effect(() => {
		// This effect will run whenever the component is shown
		if (typeof window !== 'undefined') {
			loadData();
		}
	});

	function openCreateModal() {
		entityState.openCreate();
		if (!schema) {
			fetch('/api/schemas/store')
				.then((r) => r.json())
				.then((data) => {
					schema = data;
				})
				.catch((e) => {
					console.error('Failed to load schema:', e);
				});
		}
	}

	async function handleSubmit(data: any) {
		entityState.creating = true;
		messageHandler.clear();

		try {
			const slug = generateSlug(data.name);

			let logoFilename = '';
			if (entityState.logoChanged && entityState.logoDataUrl) {
				const savedPath = await saveLogoImage(slug, entityState.logoDataUrl, 'store');
				if (!savedPath) {
					messageHandler.showError('Failed to save logo');
					entityState.creating = false;
					return;
				}
				logoFilename = savedPath;
			}

			const newStoreData = {
				...data,
				id: slug,
				slug: slug,
				logo: logoFilename
			};

			const success = await db.saveStore(newStoreData);

			if (success) {
				messageHandler.showSuccess('Store created successfully!');
				entityState.closeCreate();
				entityState.resetLogo();
				setTimeout(() => {
					window.location.reload();
				}, 500);
			} else {
				messageHandler.showError('Failed to create store');
			}
		} catch (e) {
			messageHandler.showError(e instanceof Error ? e.message : 'Failed to create store');
		} finally {
			entityState.creating = false;
		}
	}
</script>

<svelte:head>
	<title>Stores</title>
</svelte:head>

<div class="container mx-auto px-4 py-8">
	<div class="mb-6">
		<BackButton href="/" label="Home" />

		{#if messageHandler.message}
			<MessageBanner type={messageHandler.type} message={messageHandler.message} />
		{/if}

		<div class="flex items-center justify-between mb-2">
			<h1 class="text-3xl font-bold">Stores</h1>
			<button
				onclick={openCreateModal}
				class="bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-md font-medium flex items-center gap-2"
			>
				<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
					<path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" />
				</svg>
				Add Store
			</button>
		</div>
		<p class="text-muted-foreground">Browse and edit filament stores</p>
	</div>

	<DataDisplay {loading} {error} data={stores}>
		{#snippet children(storesList)}
			<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
				{#each storesList as store}
					{@const storePath = `stores/${store.id}`}
					{@const storeChange = $isCloudMode ? $changeStore.changes[storePath] : undefined}
					<EntityCard
						entity={store}
						href="/stores/{store.slug ?? store.id}"
						logo={store.logo}
						logoType="store"
						logoEntityId={store.slug ?? store.id}
						hoverColor="blue"
						fields={[
							{
								key: 'ships_from',
								label: 'Ships from',
								format: (v) => (Array.isArray(v) ? v.join(', ') : v),
								class: 'text-muted-foreground'
							}
						]}
						hasLocalChanges={!!storeChange}
						localChangeType={storeChange?.operation}
					/>
				{/each}
			</div>
		{/snippet}
	</DataDisplay>
</div>

<Modal show={entityState.showCreateModal} title="Create New Store" onClose={entityState.closeCreate} maxWidth="3xl">
	{#if schema}
		<StoreForm
			store={newStore}
			{schema}
			onSubmit={handleSubmit}
			onLogoChange={entityState.handleLogoChange}
			logoChanged={entityState.logoChanged}
			saving={entityState.creating}
		/>
	{:else}
		<div class="flex justify-center items-center py-12">
			<div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
		</div>
	{/if}
</Modal>
