<script lang="ts">
	import { onMount } from 'svelte';
	import type { Store } from '$lib/types/database';
	import { db } from '$lib/services/database';
	import Logo from '$lib/components/Logo.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import StoreForm from '$lib/components/forms/StoreForm.svelte';
	import MessageBanner from '$lib/components/MessageBanner.svelte';

	let stores: Store[] = $state([]);
	let loading: boolean = $state(true);
	let error: string | null = $state(null);
	let successMessage: string | null = $state(null);

	let showCreateModal: boolean = $state(false);
	let schema: any = $state(null);
	let saving: boolean = $state(false);
	let logoDataUrl: string = $state('');
	let logoChanged: boolean = $state(false);

	// Empty store template for new store creation
	const newStore: Store = {
		id: '',
		name: '',
		logo: '',
		storefront_url: '',
		ships_from: [],
		ships_to: []
	};

	onMount(async () => {
		try {
			const index = await db.loadIndex();
			stores = index.stores;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load stores';
		} finally {
			loading = false;
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
		error = null;
		successMessage = null;

		try {
			// Generate slug from name (URL-friendly format with hyphens)
			const slug = data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

			// If logo was uploaded, save it
			let logoFilename = '';
			if (logoChanged && logoDataUrl) {
				const savedPath = await saveLogoImage(slug, logoDataUrl);
				if (!savedPath) {
					error = 'Failed to save logo';
					saving = false;
					return;
				}
				logoFilename = getLogoFilename(logoDataUrl);
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
				successMessage = 'Store created successfully!';
				showCreateModal = false;
				logoChanged = false;
				logoDataUrl = '';

				// Reload stores list
				const index = await db.loadIndex();
				stores = index.stores;

				setTimeout(() => {
					successMessage = null;
				}, 3000);
			} else {
				error = 'Failed to create store';
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to create store';
		} finally {
			saving = false;
		}
	}

	async function saveLogoImage(storeId: string, dataUrl: string): Promise<string | null> {
		try {
			const response = await fetch('/api/stores/logo', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					storeId,
					imageData: dataUrl,
					type: 'store'
				})
			});

			if (!response.ok) {
				throw new Error('Failed to save logo');
			}

			const result = await response.json();
			return result.path;
		} catch (e) {
			console.error('Error saving logo:', e);
			return null;
		}
	}

	function handleLogoChange(dataUrl: string) {
		logoDataUrl = dataUrl;
		logoChanged = true;
	}

	function getLogoFilename(dataUrl: string): string {
		const match = dataUrl.match(/^data:image\/(\w+);base64,/);
		if (match) {
			const extension = match[1];
			return `logo.${extension}`;
		}
		return 'logo.png';
	}
</script>

<div class="container mx-auto px-4 py-8">
	<div class="mb-6">
		<a href="/" class="text-blue-600 hover:text-blue-800 flex items-center gap-2 mb-4">
			← Back to Home
		</a>

		{#if successMessage}
			<MessageBanner type="success" message={successMessage} />
		{/if}

		{#if error}
			<MessageBanner type="error" message={`Error: ${error}`} />
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

	{#if loading}
		<div class="flex justify-center items-center py-12">
			<div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
		</div>
	{:else if error}
		<div class="bg-red-50 border border-red-200 rounded-lg p-4">
			<p class="text-red-800">Error: {error}</p>
		</div>
	{:else}
		<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
			{#each stores as store}
				<a
					href="/stores/{store.slug ?? store.id}"
					class="block p-6 border border-gray-200 rounded-lg hover:border-blue-500 hover:shadow-lg transition-all"
				>
					<div class="flex items-center gap-4 mb-4">
						<Logo src={store.logo} alt={store.name} type="store" id={store.slug ?? store.id} size="md" />
						<div>
							<h3 class="font-semibold text-lg">{store.name}</h3>
							<p class="text-xs text-gray-500">ID: {store.id}</p>
						</div>
					</div>
					<p class="text-sm text-gray-600">
						Ships from: {Array.isArray(store.ships_from)
							? store.ships_from.join(', ')
							: store.ships_from}
					</p>
				</a>
			{/each}
		</div>
	{/if}
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
