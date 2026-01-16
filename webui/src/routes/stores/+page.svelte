<script lang="ts">
	import { onMount } from 'svelte';
	import type { Store } from '$lib/types/database';
	import { db } from '$lib/services/database';
	import Modal from '$lib/components/Modal.svelte';
	import StoreForm from '$lib/components/forms/StoreForm.svelte';
	import MessageBanner from '$lib/components/MessageBanner.svelte';
	import DataDisplay from '$lib/components/DataDisplay.svelte';
	import EntityCard from '$lib/components/EntityCard.svelte';
	import { createMessageHandler } from '$lib/utils/messageHandler.svelte';
	import { saveLogoImage } from '$lib/utils/logoManagement';

	let stores: Store[] = $state([]);
	let loading: boolean = $state(true);
	let error: string | null = $state(null);

	let showCreateModal: boolean = $state(false);
	let schema: any = $state(null);
	let saving: boolean = $state(false);
	let logoDataUrl: string = $state('');
	let logoChanged: boolean = $state(false);

	// Create message handler
	const messageHandler = createMessageHandler();

	// Empty store template for new store creation
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
		showCreateModal = true;
		// Load schema when modal opens
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

	function closeCreateModal() {
		showCreateModal = false;
		logoChanged = false;
		logoDataUrl = '';
	}

	async function handleSubmit(data: any) {
		saving = true;
		messageHandler.clear();

		try {
			// Generate slug from name (URL-friendly format with hyphens)
			const slug = data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

			// If logo was uploaded, save it
			let logoFilename = '';
			if (logoChanged && logoDataUrl) {
				const savedPath = await saveLogoImage(slug, logoDataUrl, 'store');
				if (!savedPath) {
					messageHandler.showError('Failed to save logo');
					saving = false;
					return;
				}
				// In cloud mode, savedPath is the imageId for change store lookup
				// In local mode, savedPath is the filename
				logoFilename = savedPath;
			}

			// Create new store with generated ID and slug
			// In cloud mode, both id and slug should be the same slug format
			const newStoreData = {
				...data,
				id: slug,
				slug: slug,
				logo: logoFilename
			};

			const success = await db.saveStore(newStoreData);

			if (success) {
				messageHandler.showSuccess('Store created successfully!');
				showCreateModal = false;
				logoChanged = false;
				logoDataUrl = '';

				// Reload the page to ensure UI is in sync
				setTimeout(() => {
					window.location.reload();
				}, 500);
			} else {
				messageHandler.showError('Failed to create store');
			}
		} catch (e) {
			messageHandler.showError(e instanceof Error ? e.message : 'Failed to create store');
		} finally {
			saving = false;
		}
	}

	function handleLogoChange(dataUrl: string) {
		logoDataUrl = dataUrl;
		logoChanged = true;
	}
</script>

<svelte:head>
	<title>Stores</title>
</svelte:head>

<div class="container mx-auto px-4 py-8">
	<div class="mb-6">
		<a href="/" class="text-blue-600 hover:text-blue-800 flex items-center gap-2 mb-4">
			← Back to Home
		</a>

		{#if messageHandler.message}
			<MessageBanner type={messageHandler.type} message={messageHandler.message} />
		{/if}

		<div class="flex items-center justify-between mb-2">
			<h1 class="text-3xl font-bold">Stores</h1>
			<button
				onclick={openCreateModal}
				class="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
			>
				<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
					<path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" />
				</svg>
				Add Store
			</button>
		</div>
		<p class="text-gray-600">Browse and edit filament stores</p>
	</div>

	<DataDisplay {loading} {error} data={stores}>
		{#snippet children(storesList)}
			<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
				{#each storesList as store}
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
								class: 'text-gray-600'
							}
						]}
					/>
				{/each}
			</div>
		{/snippet}
	</DataDisplay>
</div>

<Modal show={showCreateModal} title="Create New Store" onClose={closeCreateModal} maxWidth="3xl">
	{#if schema}
		<StoreForm
			store={newStore}
			{schema}
			onSubmit={handleSubmit}
			onLogoChange={handleLogoChange}
			{logoChanged}
			{saving}
		/>
	{:else}
		<div class="flex justify-center items-center py-12">
			<div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
		</div>
	{/if}
</Modal>
