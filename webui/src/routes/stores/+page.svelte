<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import type { Store } from '$lib/types/database';
	import { db } from '$lib/services/database';
	import { Modal, MessageBanner, Button, LoadingSpinner } from '$lib/components/ui';
	import { StoreForm } from '$lib/components/forms';
	import { DataDisplay } from '$lib/components/layout';
	import { EntityCard } from '$lib/components/entity';
	import { createMessageHandler } from '$lib/utils/messageHandler.svelte';
	import { createEntityState } from '$lib/utils/entityState.svelte';
	import { generateSlug } from '$lib/services/entityService';
	import { saveLogoImage } from '$lib/utils/logoManagement';
	import { useChangeTracking } from '$lib/stores/environment';
	import { changes } from '$lib/stores/changes';
	import { withDeletedStubs, getChildChangeProps } from '$lib/utils/deletedStubs';
	import { BackButton } from '$lib/components';

	let stores: Store[] = $state([]);
	let loading: boolean = $state(true);
	let error: string | null = $state(null);
	let schema: any = $state(null);

	let displayStores = $derived.by(() => withDeletedStubs({
		changes: $changes,
		useChangeTracking: $useChangeTracking,
		rootNamespace: 'stores',
		items: stores,
		getKeys: (s) => [s.id, s.slug],
		buildStub: (id, name) => ({ id, slug: id, name, logo: '', storefront_url: '', ships_from: [], ships_to: [] } as Store)
	}));

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
			stores = index.stores.sort((a, b) => a.name.localeCompare(b.name));
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

			// Check for duplicate store
			const duplicate = stores.find((s) => (s.slug ?? s.id).toLowerCase() === slug.toLowerCase());
			if (duplicate) {
				messageHandler.showError(`Store "${data.name}" already exists`);
				entityState.creating = false;
				return;
			}

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
				goto(`/stores/${slug}`);
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
			<Button onclick={openCreateModal}>
				<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
					<path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" />
				</svg>
				Add Store
			</Button>
		</div>
		<p class="text-muted-foreground">Browse and edit filament stores</p>
	</div>

	<DataDisplay {loading} {error} data={displayStores}>
		{#snippet children(storesList)}
			<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
				{#each storesList as store}
					{@const storePath = `stores/${store.id}`}
					{@const changeProps = getChildChangeProps($changes, $useChangeTracking, storePath)}
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
						hasLocalChanges={changeProps.hasLocalChanges}
						localChangeType={changeProps.localChangeType}
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
			<LoadingSpinner size="xl" class="text-primary" />
		</div>
	{/if}
</Modal>
