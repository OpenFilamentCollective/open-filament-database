<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import type { Store } from '$lib/types/database';
	import { db } from '$lib/services/database';
	import Modal from '$lib/components/Modal.svelte';
	import StoreForm from '$lib/components/forms/StoreForm.svelte';
	import MessageBanner from '$lib/components/MessageBanner.svelte';
	import BackButton from '$lib/components/BackButton.svelte';
	import DataDisplay from '$lib/components/DataDisplay.svelte';
	import EntityDetails from '$lib/components/EntityDetails.svelte';
	import Logo from '$lib/components/Logo.svelte';
	import { createMessageHandler } from '$lib/utils/messageHandler.svelte';
	import { saveLogoImage, deleteLogoImage } from '$lib/utils/logoManagement';
	import { changeStore } from '$lib/stores/changes';
	import { isCloudMode } from '$lib/stores/environment';

	let storeId: string = $derived($page.params.store!);
	let store: Store | null = $state(null);
	let schema: any = $state(null);
	let loading: boolean = $state(true);
	let saving: boolean = $state(false);
	let error: string | null = $state(null);

	let showEditModal: boolean = $state(false);
	let showDeleteModal: boolean = $state(false);
	let logoDataUrl: string = $state('');
	let logoChanged: boolean = $state(false);
	let deleting: boolean = $state(false);

	// Create message handler
	const messageHandler = createMessageHandler();

	// Check if this store has local changes
	let hasLocalChanges = $derived.by(() => {
		if (!$isCloudMode || !store) return false;

		const entityPath = `stores/${storeId}`;
		const change = $changeStore.changes[entityPath];

		return change && (change.operation === 'create' || change.operation === 'update');
	});

	onMount(async () => {
		try {
			const [storeData, schemaData] = await Promise.all([
				db.getStore(storeId),
				fetch('/api/schemas/store').then((r) => r.json())
			]);

			if (!storeData) {
				error = 'Store not found';
				loading = false;
				return;
			}

			store = storeData;
			schema = schemaData;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load store';
		} finally {
			loading = false;
		}
	});

	async function handleSubmit(data: any) {
		if (!store) return;

		saving = true;
		messageHandler.clear();

		try {
			// If logo was changed, save the new logo and delete the old one
			let logoFilename = store.logo;
			if (logoChanged && logoDataUrl) {
				// Delete old logo first
				if (store.logo) {
					await deleteLogoImage(store.id, store.logo, 'store');
				}

				// Upload new logo
				const savedPath = await saveLogoImage(store.id, logoDataUrl, 'store');
				if (!savedPath) {
					messageHandler.showError('Failed to save logo');
					saving = false;
					return;
				}
				// In cloud mode, savedPath is the imageId for change store lookup
				// In local mode, savedPath is the file path but we use the filename
				logoFilename = savedPath;
			}

			// Update store data with new logo filename (or keep existing if not changed)
			// Preserve id and slug from original store since form doesn't include them
			const updatedStore = {
				...data,
				id: store.id,
				slug: store.slug ?? store.id,
				logo: logoFilename
			};

			// Pass the old store data so change tracking knows this is an update, not a create
			const success = await db.saveStore(updatedStore, store);

			if (success) {
				store = updatedStore;
				logoChanged = false;
				logoDataUrl = '';
				messageHandler.showSuccess('Store saved successfully!');
				showEditModal = false;

				// Reload the page to ensure UI is in sync
				setTimeout(() => {
					window.location.reload();
				}, 500);
			} else {
				messageHandler.showError('Failed to save store');
			}
		} catch (e) {
			messageHandler.showError(e instanceof Error ? e.message : 'Failed to save store');
		} finally {
			saving = false;
		}
	}

	function handleLogoChange(dataUrl: string) {
		logoDataUrl = dataUrl;
		logoChanged = true;
	}

	function openEditModal() {
		showEditModal = true;
	}

	function closeEditModal() {
		showEditModal = false;
		logoChanged = false;
		logoDataUrl = '';
	}

	function openDeleteModal() {
		showDeleteModal = true;
	}

	function closeDeleteModal() {
		showDeleteModal = false;
	}

	async function handleDelete() {
		if (!store) return;

		deleting = true;
		messageHandler.clear();

		try {
			if ($isCloudMode) {
				// In cloud mode, check if this is a newly created store
				const entityPath = `stores/${storeId}`;
				const change = $changeStore.changes[entityPath];

				if (change && change.operation === 'create') {
					// If it was created locally, just remove the change
					changeStore.removeChange(entityPath);
					messageHandler.showSuccess('Local store creation removed');
				} else {
					// Otherwise, track as a delete or remove existing update changes
					await db.deleteStore(store.id, store);
					messageHandler.showSuccess('Store marked for deletion - export to save');
				}
			} else {
				// In local mode, delete from filesystem
				const success = await db.deleteStore(store.id, store);
				if (success) {
					messageHandler.showSuccess('Store deleted successfully');
				} else {
					messageHandler.showError('Failed to delete store');
					deleting = false;
					showDeleteModal = false;
					return;
				}
			}

			// Navigate back to stores list after successful delete
			showDeleteModal = false;
			setTimeout(() => {
				window.location.href = '/stores';
			}, 1500);
		} catch (e) {
			messageHandler.showError(e instanceof Error ? e.message : 'Failed to delete store');
			deleting = false;
			showDeleteModal = false;
		}
	}
</script>

<svelte:head>
	<title>{store ? `${store.name}` : 'Store Not Found'}</title>
</svelte:head>

<div class="container mx-auto px-4 py-8 max-w-4xl">
	<div class="mb-6">
		<BackButton href="/stores" label="Stores" />
	</div>

	<DataDisplay {loading} {error} data={store}>
		{#snippet children(storeData)}
			<header class="mb-6 flex items-center gap-4">
				<Logo src={storeData.logo} alt={storeData.name} type="store" id={storeData.id} size="lg" />
				<div>
					<h1 class="text-3xl font-bold mb-2">{storeData.name}</h1>
					<p class="text-gray-600">Store ID: {storeData.id}</p>
				</div>
			</header>

			{#if hasLocalChanges}
				<MessageBanner type="info" message="Local changes - export to save" />
			{/if}

			{#if messageHandler.message}
				<MessageBanner type={messageHandler.type} message={messageHandler.message} />
			{/if}

			<EntityDetails
				entity={storeData}
				title="Store Details"
				fields={[
					{ key: 'name' },
					{ key: 'storefront_url', label: 'Storefront URL', type: 'link' },
					{ key: 'logo', type: 'logo', logoType: 'store', logoEntityId: storeData.slug ?? storeData.id },
					{
						key: 'ships_from',
						label: 'Ships From',
						format: (v) => (Array.isArray(v) ? v.join(', ') : v)
					},
					{
						key: 'ships_to',
						label: 'Ships To',
						format: (v) => (Array.isArray(v) ? v.join(', ') : v)
					}
				]}
			>
				{#snippet actions()}
					<div class="flex gap-2">
						<button
							onclick={openEditModal}
							class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
						>
							Edit
						</button>
						<button
							onclick={openDeleteModal}
							class="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
						>
							Delete
						</button>
					</div>
				{/snippet}
			</EntityDetails>
		{/snippet}
	</DataDisplay>
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

<Modal show={showDeleteModal} title="Delete Store" onClose={closeDeleteModal} maxWidth="md">
	{#if store}
		<div class="space-y-4">
			<p class="text-gray-700">
				Are you sure you want to delete the store <strong>{store.name}</strong>?
			</p>

			{#if $isCloudMode}
				<div class="bg-blue-50 border border-blue-200 rounded p-3">
					<p class="text-sm text-blue-800">
						{#if $changeStore.changes[`stores/${storeId}`]?.operation === 'create'}
							This will remove the locally created store. The change will be discarded.
						{:else}
							This will mark the store for deletion. Remember to export your changes.
						{/if}
					</p>
				</div>
			{:else}
				<div class="bg-red-50 border border-red-200 rounded p-3">
					<p class="text-sm text-red-800">
						This action cannot be undone. The store will be permanently deleted from the filesystem.
					</p>
				</div>
			{/if}

			<div class="flex justify-end gap-2 pt-4">
				<button
					onclick={closeDeleteModal}
					disabled={deleting}
					class="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 transition-colors disabled:opacity-50"
				>
					Cancel
				</button>
				<button
					onclick={handleDelete}
					disabled={deleting}
					class="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors disabled:opacity-50"
				>
					{deleting ? 'Deleting...' : 'Delete Store'}
				</button>
			</div>
		</div>
	{/if}
</Modal>
