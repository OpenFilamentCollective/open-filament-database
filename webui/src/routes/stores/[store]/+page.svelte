<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import type { Store } from '$lib/types/database';
	import { db } from '$lib/services/database';
	import Modal from '$lib/components/Modal.svelte';
	import StoreForm from '$lib/components/forms/StoreForm.svelte';
	import MessageBanner from '$lib/components/MessageBanner.svelte';
	import BackButton from '$lib/components/BackButton.svelte';
	import RefreshButton from '$lib/components/RefreshButton.svelte';

	let storeId: string = $derived($page.params.store!);
	let store: Store | null = $state(null);
	let schema: any = $state(null);
	let loading: boolean = $state(true);
	let saving: boolean = $state(false);
	let error: string | null = $state(null);
	let successMessage: string | null = $state(null);

	let showEditModal: boolean = $state(false);
	let logoDataUrl: string = $state('');
	let logoChanged: boolean = $state(false);

	async function loadData() {
		loading = true;
		error = null;
		try {
			const [storeData, schemaData] = await Promise.all([
				db.getStore(storeId),
				fetch('/api/schemas/store').then((r) => r.json())
			]);

			if (!storeData) {
				error = 'Store not found';
				return;
			}

			store = storeData;
			schema = schemaData;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load store';
		} finally {
			loading = false;
		}
	}

	onMount(loadData);

	// Reload data when storeId changes (reactive to route changes and localStorage updates)
	$effect(() => {
		// Access storeId to make this effect reactive to it
		const id = storeId;
		// Only reload if we're not in initial mount (onMount handles that)
		if (store && store.id !== id) {
			loadData();
		}
	});

	async function handleSubmit(data: any) {
		if (!store) return;

		saving = true;
		error = null;
		successMessage = null;

		try {
			// If logo was changed, save the new logo and delete the old one
			let logoFilename = store.logo;
			if (logoChanged && logoDataUrl) {
				// Delete old logo first
				if (store.logo) {
					await deleteLogoImage(store.id, store.logo);
				}

				// Upload new logo
				const savedPath = await saveLogoImage(store.id, logoDataUrl);
				if (!savedPath) {
					error = 'Failed to save logo';
					saving = false;
					return;
				}
				// Generate new logo filename based on the uploaded file type
				logoFilename = getLogoFilename(logoDataUrl);
			}

			// Update store data with new logo filename (or keep existing if not changed)
			const updatedStore = {
				...data,
				logo: logoFilename
			};

			// Pass the old store data so change tracking knows this is an update, not a create
			const success = await db.saveStore(updatedStore, store);

			if (success) {
				store = updatedStore;
				logoChanged = false;
				logoDataUrl = '';
				successMessage = 'Store saved successfully!';
				showEditModal = false;

				setTimeout(() => {
					successMessage = null;
				}, 3000);
			} else {
				error = 'Failed to save store';
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to save store';
		} finally {
			saving = false;
		}
	}

	async function deleteLogoImage(storeId: string, logoFilename: string): Promise<void> {
		try {
			const response = await fetch('/api/stores/logo', {
				method: 'DELETE',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					storeId,
					logoFilename,
					type: 'store'
				})
			});

			if (!response.ok) {
				console.warn('Failed to delete old logo:', logoFilename);
			}
		} catch (e) {
			console.warn('Error deleting old logo:', e);
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
		// Extract the file type from the data URL
		const match = dataUrl.match(/^data:image\/(\w+);base64,/);
		if (match) {
			const extension = match[1];
			return `logo.${extension}`;
		}
		return 'logo.png'; // Default fallback
	}

	function openEditModal() {
		showEditModal = true;
	}

	function closeEditModal() {
		showEditModal = false;
		logoChanged = false;
		logoDataUrl = '';
	}
</script>

<div class="container mx-auto px-4 py-8 max-w-4xl">
	<div class="mb-6">
		<BackButton
			href="/stores"
			label="Stores"
		/>
	</div>

	{#if loading}
		<div class="flex justify-center items-center py-12">
			<div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
		</div>
	{:else if error && !store}
		<div class="bg-red-50 border border-red-200 rounded-lg p-4">
			<p class="text-red-800">Error: {error}</p>
		</div>
	{:else if store}
		<header class="mb-6">
			<div class="flex justify-between items-start">
				<div>
					<h1 class="text-3xl font-bold mb-2">{store.name}</h1>
					<p class="text-gray-600">Store ID: {store.id}</p>
				</div>
			</div>
		</header>

		{#if successMessage}
			<MessageBanner type="success" message={successMessage} />
		{/if}

		{#if error}
			<MessageBanner type="error" message={`Error: ${error}`} />
		{/if}

		<div class="bg-white border border-gray-200 rounded-lg p-6">
			<div class="flex justify-between items-center mb-4">
				<h2 class="text-xl font-semibold">Store Details</h2>
				<button
					onclick={openEditModal}
					class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
				>
					Edit
				</button>
			</div>

			<dl class="space-y-4">
				<div>
					<dt class="text-sm font-medium text-gray-500">Name</dt>
					<dd class="mt-1 text-lg">{store.name}</dd>
				</div>
				<div>
					<dt class="text-sm font-medium text-gray-500">Storefront URL</dt>
					<dd class="mt-1">
						<a href={store.storefront_url} target="_blank" class="text-blue-600 hover:underline">
							{store.storefront_url}
						</a>
					</dd>
				</div>
				<div>
					<dt class="text-sm font-medium text-gray-500">Logo</dt>
					<dd class="mt-1">{store.logo}</dd>
				</div>
				<div>
					<dt class="text-sm font-medium text-gray-500">Ships From</dt>
					<dd class="mt-1">
						{Array.isArray(store.ships_from) ? store.ships_from.join(', ') : store.ships_from}
					</dd>
				</div>
				<div>
					<dt class="text-sm font-medium text-gray-500">Ships To</dt>
					<dd class="mt-1">
						{Array.isArray(store.ships_to) ? store.ships_to.join(', ') : store.ships_to}
					</dd>
				</div>
			</dl>
		</div>
	{/if}
</div>

<Modal show={showEditModal} title="Edit Store" onClose={closeEditModal} maxWidth="3xl">
	{#if store && schema}
		<StoreForm
			{store}
			{schema}
			onSubmit={handleSubmit}
			onLogoChange={handleLogoChange}
			{logoChanged}
			{saving}
		/>
	{/if}
</Modal>
