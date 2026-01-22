<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import type { Store } from '$lib/types/database';
	import { db } from '$lib/services/database';
	import { Modal, MessageBanner, DeleteConfirmationModal, ActionButtons } from '$lib/components/ui';
	import { StoreForm } from '$lib/components/forms';
	import { BackButton } from '$lib/components/actions';
	import { DataDisplay } from '$lib/components/layout';
	import { EntityDetails, Logo } from '$lib/components/entity';
	import { createMessageHandler } from '$lib/utils/messageHandler.svelte';
	import { createEntityState } from '$lib/utils/entityState.svelte';
	import { deleteEntity, mergeEntityData } from '$lib/services/entityService';
	import { saveLogoImage, deleteLogoImage } from '$lib/utils/logoManagement';
	import { isCloudMode } from '$lib/stores/environment';

	let storeId: string = $derived($page.params.store!);
	let store: Store | null = $state(null);
	let originalStore: Store | null = $state(null);
	let schema: any = $state(null);
	let loading: boolean = $state(true);
	let error: string | null = $state(null);

	const messageHandler = createMessageHandler();

	const entityState = createEntityState({
		getEntityPath: () => (store ? `stores/${store.id}` : null),
		getEntity: () => store
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
			originalStore = structuredClone(storeData);
			schema = schemaData;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load store';
		} finally {
			loading = false;
		}
	});

	async function handleSubmit(data: any) {
		if (!store) return;

		entityState.saving = true;
		messageHandler.clear();

		try {
			let logoFilename = store.logo;
			if (entityState.logoChanged && entityState.logoDataUrl) {
				if (store.logo) {
					await deleteLogoImage(store.id, store.logo, 'store');
				}
				const savedPath = await saveLogoImage(store.id, entityState.logoDataUrl, 'store');
				if (!savedPath) {
					messageHandler.showError('Failed to save logo');
					entityState.saving = false;
					return;
				}
				logoFilename = savedPath;
			}

			const updatedStore = mergeEntityData(store, { ...data, logo: logoFilename }, [
				'id',
				'slug'
			]) as Store;

			const success = await db.saveStore(updatedStore, originalStore ?? store);

			if (success) {
				store = updatedStore;
				entityState.resetLogo();
				messageHandler.showSuccess('Store saved successfully!');
				entityState.closeEdit();
				setTimeout(() => {
					window.location.reload();
				}, 500);
			} else {
				messageHandler.showError('Failed to save store');
			}
		} catch (e) {
			messageHandler.showError(e instanceof Error ? e.message : 'Failed to save store');
		} finally {
			entityState.saving = false;
		}
	}

	async function handleDelete() {
		if (!store) return;

		entityState.deleting = true;
		messageHandler.clear();

		try {
			const result = await deleteEntity(`stores/${store.id}`, 'Store', () =>
				db.deleteStore(store!.id, store!)
			);

			if (result.success) {
				messageHandler.showSuccess(result.message);
				entityState.closeDelete();
				setTimeout(() => {
					window.location.href = '/stores';
				}, 1500);
			} else {
				messageHandler.showError(result.message);
				entityState.deleting = false;
			}
		} catch (e) {
			messageHandler.showError(e instanceof Error ? e.message : 'Failed to delete store');
			entityState.deleting = false;
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
					{#if $isCloudMode}
						{#if storeData.slug}
							<p class="text-muted-foreground">Native ID: {storeData.slug}</p>
							<p class="text-muted-foreground">Cloud ID: {storeData.id}</p>
						{:else}
							<p class="text-muted-foreground">Native ID: {storeData.id}</p>
						{/if}
					{:else}
						<p class="text-muted-foreground">ID: {storeData.id}</p>
					{/if}
				</div>
			</header>

			{#if entityState.hasLocalChanges}
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
					{
						key: 'logo',
						type: 'logo',
						logoType: 'store',
						logoEntityId: storeData.slug ?? storeData.id
					},
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
					<ActionButtons onEdit={entityState.openEdit} onDelete={entityState.openDelete} editVariant="primary" />
				{/snippet}
			</EntityDetails>
		{/snippet}
	</DataDisplay>
</div>

<Modal show={entityState.showEditModal} title="Edit Store" onClose={entityState.closeEdit} maxWidth="3xl">
	{#if store && schema}
		<StoreForm
			{store}
			{schema}
			onSubmit={handleSubmit}
			onLogoChange={entityState.handleLogoChange}
			logoChanged={entityState.logoChanged}
			saving={entityState.saving}
		/>
	{/if}
</Modal>

<DeleteConfirmationModal
	show={entityState.showDeleteModal}
	title="Delete Store"
	entityName={store?.name ?? ''}
	isLocalCreate={entityState.isLocalCreate}
	deleting={entityState.deleting}
	onClose={entityState.closeDelete}
	onDelete={handleDelete}
/>
