<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import type { Store } from '$lib/types/database';
	import { db } from '$lib/services/database';
	import { Modal, MessageBanner, Button, LoadingSpinner, SearchBar } from '$lib/components/ui';
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
	import { fetchEntitySchema } from '$lib/services/schemaService';
	import { hasCompatibleClipboard } from '$lib/services/clipboardService';
	import { createCopyAction, createDuplicateAction, createPasteHandler } from '$lib/utils/useEntityActions.svelte';

	let stores: Store[] = $state([]);
	let loading: boolean = $state(true);
	let error: string | null = $state(null);
	let schema: any = $state(null);
	let searchQuery: string = $state('');

	let displayStores = $derived.by(() => withDeletedStubs({
		changes: $changes,
		useChangeTracking: $useChangeTracking,
		rootNamespace: 'stores',
		items: stores,
		getKeys: (s) => [s.id, s.slug],
		buildStub: (id, name) => ({ id, slug: id, name, logo: '', storefront_url: '', ships_from: [], ships_to: [] } as Store)
	}));

	let filteredStores = $derived.by(() => {
		const q = searchQuery.toLowerCase().trim();
		if (!q) return displayStores;
		return displayStores.filter((s) => {
			const shipsFrom = Array.isArray(s.ships_from) ? s.ships_from.join(' ') : (s.ships_from ?? '');
			const shipsTo = Array.isArray(s.ships_to) ? s.ships_to.join(' ') : (s.ships_to ?? '');
			const fields = [s.name, s.id, s.slug, s.storefront_url, shipsFrom, shipsTo].filter(Boolean);
			return fields.some((f) => f!.toLowerCase().includes(q));
		});
	});

	const messageHandler = createMessageHandler();

	const entityState = createEntityState({
		getEntityPath: () => null,
		getEntity: () => null
	});

	let schemaError: string | null = $state(null);

	let prefillStoreData: Store | null = $state(null);

	function newStore(): Store {
		return prefillStoreData ?? {
			id: '',
			name: '',
			logo: '',
			storefront_url: '',
			ships_from: [],
			ships_to: []
		};
	}

	// Shared actions for store cards (no children, so no options modal)
	const storeCopy = createCopyAction('store', null);
	const storeDuplicate = createDuplicateAction('store', false, (data) => {
		prefillStoreData = data as Store;
		openCreateModal();
	});
	const storePaste = createPasteHandler('store', (data) => {
		prefillStoreData = data as Store;
		openCreateModal();
	}, (data) => {
		const slug = generateSlug(data.name);
		return !!(stores.find((s) => (s.slug ?? s.id).toLowerCase() === slug.toLowerCase()) ||
			stores.find((s) => s.name.toLowerCase() === data.name.trim().toLowerCase()));
	});

	$effect(() => {
		if (!entityState.showCreateModal) {
			prefillStoreData = null;
		}
	});

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

	function openCreateModal() {
		schemaError = null;
		entityState.openCreate();
		if (!schema) {
			fetchEntitySchema('store')
				.then((data) => {
					if (!data) {
						schemaError = 'Failed to load schema';
						return;
					}
					schema = data;
				})
				.catch((e) => {
					console.error('Failed to load schema:', e);
					schemaError = e instanceof Error ? e.message : 'Failed to load schema';
				});
		}
	}

	async function handleSubmit(data: any) {
		entityState.creating = true;
		messageHandler.clear();

		try {
			const slug = generateSlug(data.name);

			// Check for duplicate store by slug/path and by name
			const duplicateBySlug = stores.find((s) =>
				(s.slug ?? s.id).toLowerCase() === slug.toLowerCase()
			);
			const duplicateByName = stores.find((s) =>
				s.name.toLowerCase() === data.name.trim().toLowerCase()
			);
			if (duplicateBySlug || duplicateByName) {
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

		<div class="flex items-center justify-between mb-2">
			<h1 class="text-3xl font-bold">Stores</h1>
			<div class="flex gap-2">
				{#if hasCompatibleClipboard('store')}
					<Button onclick={storePaste} variant="outline">
						<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
							<path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
							<path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
						</svg>
						Paste Store
					</Button>
				{/if}
				<Button onclick={openCreateModal}>
					<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
						<path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" />
					</svg>
					Add Store
				</Button>
			</div>
		</div>
		<p class="text-muted-foreground">Browse and edit filament stores</p>
	</div>

	<DataDisplay {loading} {error} data={displayStores}>
		{#snippet children(storesList)}
			<div class="mb-4">
				<SearchBar
					value={searchQuery}
					placeholder="Search stores by name, shipping region..."
					oninput={(v) => searchQuery = v}
				/>
				{#if searchQuery}
					<p class="text-xs text-muted-foreground mt-1">
						{filteredStores.length} of {storesList.length} stores shown
					</p>
				{/if}
			</div>
			{#if searchQuery && filteredStores.length === 0}
				<p class="text-muted-foreground">No stores matching "{searchQuery}"</p>
			{:else}
			<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
				{#each filteredStores as store}
					{@const storePath = `stores/${store.slug ?? store.id}`}
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
						entityType="store"
						onCopy={() => storeCopy.request(store, `stores/${store.slug ?? store.id}`)}
						onDuplicate={() => storeDuplicate.request(store)}
						onPaste={storePaste}
					/>
				{/each}
			</div>
			{/if}
		{/snippet}
	</DataDisplay>
</div>

<Modal show={entityState.showCreateModal} title="Create New Store" onClose={entityState.closeCreate} maxWidth="3xl">
	{#if messageHandler.message}
		<MessageBanner type={messageHandler.type} message={messageHandler.message} />
	{/if}
	{#if schema}
		<StoreForm
			store={newStore()}
			{schema}
			onSubmit={handleSubmit}
			onLogoChange={entityState.handleLogoChange}
			logoChanged={entityState.logoChanged}
			saving={entityState.creating}
		/>
	{:else if schemaError}
		<div class="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{schemaError}</div>
	{:else}
		<div class="flex justify-center items-center py-12">
			<LoadingSpinner size="xl" class="text-primary" />
		</div>
	{/if}
</Modal>
