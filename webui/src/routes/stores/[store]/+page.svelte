<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import type { Store } from '$lib/types/database';
	import { db } from '$lib/services/database';
	import { Modal, MessageBanner, DeleteConfirmationModal, Button, EntityActionDropdown, CloudCompareModal } from '$lib/components/ui';
	import { StoreForm } from '$lib/components/forms';
	import { BackButton } from '$lib/components/actions';
	import { DataDisplay } from '$lib/components/layout';
	import { EntityDetails, Logo } from '$lib/components/entity';
	import { createMessageHandler } from '$lib/utils/messageHandler.svelte';
	import { createEntityState } from '$lib/utils/entityState.svelte';
	import { deleteEntity, mergeEntityData, generateSlug } from '$lib/services/entityService';
	import { saveLogoImage } from '$lib/utils/logoManagement';
	import { untrack } from 'svelte';
	import { useChangeTracking } from '$lib/stores/environment';
	import { changes } from '$lib/stores/changes';
	import { fetchEntitySchema } from '$lib/services/schemaService';
	import { getCountryName } from '$lib/data/countryCodes';
	import { prepareDuplicateData } from '$lib/services/clipboardService';
	import { formDrafts } from '$lib/stores/formDrafts';

	const STORE_CREATE_DRAFT_KEY = 'create:store';

	let storeId: string = $derived($page.params.store!);
	let storeEditDraftKey = $derived(`edit:store:${storeId}`);
	let loadGeneration = 0;
	let store: Store | null = $state(null);
	let originalStore: Store | null = $state(null);
	let schema: any = $state(null);
	let loading: boolean = $state(true);
	let error: string | null = $state(null);

	// Duplicate store state
	let duplicateStoreError: string | null = $state(null);

	const messageHandler = createMessageHandler();

	const entityState = createEntityState({
		getEntityPath: () => (store ? `stores/${storeId}` : null),
		getEntity: () => store
	});

	$effect(() => {
		const id = storeId;
		const gen = ++loadGeneration;

		loading = true;
		error = null;
		entityState.showEditModal = false;

		(async () => {
			try {
				const [storeData, schemaData] = await Promise.all([
					db.getStore(id),
					fetchEntitySchema('store')
				]);

				if (gen !== loadGeneration) return;

				if (!storeData) {
					const storePath = `stores/${id}`;
					const change = untrack(() => $changes.get(storePath));
					if (untrack(() => $useChangeTracking) && change?.operation === 'delete') {
						error = 'This store has been deleted in your local changes. Export your changes to finalize the deletion.';
					} else {
						error = 'Store not found';
					}
					loading = false;
					return;
				}

				store = storeData;
				originalStore = structuredClone(storeData);
				schema = schemaData;
			} catch (e) {
				if (gen !== loadGeneration) return;
				error = e instanceof Error ? e.message : 'Failed to load store';
			} finally {
				if (gen === loadGeneration) {
					loading = false;
				}
			}
		})();
	});

	async function handleSubmit(data: any) {
		if (!store) return;

		entityState.saving = true;
		messageHandler.clear();

		try {
			let logoFilename = store.logo;
			if (entityState.logoChanged && entityState.logoDataUrl) {
				const savedPath = await saveLogoImage(store.id, entityState.logoDataUrl, 'store');
				if (!savedPath) {
					messageHandler.showError('Failed to save logo');
					entityState.saving = false;
					return;
				}
				logoFilename = savedPath;
			}

			const updatedStore = mergeEntityData(store as unknown as Record<string, unknown>, { ...data, logo: logoFilename }, [
				'id',
				'slug'
			]) as unknown as Store;

			const success = await db.saveStore(updatedStore, originalStore ?? store);

			if (success) {
				store = updatedStore;
				entityState.resetLogo();
				messageHandler.showSuccess('Store saved successfully!');
				formDrafts.clear(storeEditDraftKey);
				entityState.closeEdit();
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
			const result = await deleteEntity(`stores/${storeId}`, 'Store', () =>
				db.deleteStore(storeId, store!)
			);

			if (result.success) {
				messageHandler.showSuccess(result.message);
				entityState.closeDelete();
				entityState.deleting = false;
				setTimeout(() => {
					goto('/stores');
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

	// Duplicate store handler
	async function handleDuplicateStoreSubmit(data: any) {
		entityState.creating = true;
		duplicateStoreError = null;

		try {
			const slug = generateSlug(data.name);
			const existingStores = await db.loadStores();
			const dup = existingStores.find((s) => (s.slug ?? s.id).toLowerCase() === slug.toLowerCase());
			if (dup) {
				duplicateStoreError = `Store "${data.name}" already exists`;
				entityState.creating = false;
				return;
			}

			let logoFilename = '';
			if (entityState.logoChanged && entityState.logoDataUrl) {
				const savedPath = await saveLogoImage(slug, entityState.logoDataUrl, 'store');
				if (!savedPath) {
					duplicateStoreError = 'Failed to save logo';
					entityState.creating = false;
					return;
				}
				logoFilename = savedPath;
			}

			const newStoreData = { ...data, id: slug, slug, logo: logoFilename };
			const success = await db.saveStore(newStoreData);

			if (success) {
				messageHandler.showSuccess('Store duplicated successfully!');
				formDrafts.clear(STORE_CREATE_DRAFT_KEY);
				entityState.closeDuplicate();
				goto(`/stores/${slug}`);
			} else {
				duplicateStoreError = 'Failed to create store';
			}
		} catch (e) {
			duplicateStoreError = e instanceof Error ? e.message : 'Failed to duplicate store';
		} finally {
			entityState.creating = false;
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
					<p class="text-muted-foreground">ID: {storeData.slug || storeData.id}</p>
				</div>
			</header>

			{#if entityState.hasLocalChanges}
				<MessageBanner type="info" message="Local changes - export to save" />
			{:else if entityState.hasSubmittedChanges}
				<MessageBanner type="info" message="Submitted - awaiting merge" />
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
						format: (v) => (Array.isArray(v) ? v.map((c: string) => getCountryName(c)).join(', ') : getCountryName(v))
					},
					{
						key: 'ships_to',
						label: 'Ships To',
						format: (v) => (Array.isArray(v) ? v.map((c: string) => getCountryName(c)).join(', ') : getCountryName(v))
					}
				]}
			>
				{#snippet actions()}
					<div class="flex gap-2">
						<Button onclick={entityState.openEdit} variant="primary">Edit</Button>
						<EntityActionDropdown
							entityType="store"
							entityData={storeData}
							entityPath="stores/{storeId}"
							isLocalCreate={entityState.isLocalCreate}
							onDuplicate={(data) => { formDrafts.clear(STORE_CREATE_DRAFT_KEY); entityState.openDuplicate(data); }}
							onPaste={(data) => { formDrafts.clear(STORE_CREATE_DRAFT_KEY); entityState.openPaste(data); }}
							onDelete={entityState.openDelete}
							onViewDiff={entityState.openCloudCompare}
						/>
					</div>
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
			draftKey={storeEditDraftKey}
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

<!-- Duplicate Store Modal -->
<Modal show={entityState.showDuplicateModal} title="Duplicate Store" onClose={entityState.closeDuplicate} maxWidth="3xl">
	{#if duplicateStoreError}
		<MessageBanner type="error" message={duplicateStoreError} />
	{/if}
	{#if entityState.duplicateData && schema}
		<StoreForm
			store={entityState.duplicateData}
			{schema}
			draftKey={STORE_CREATE_DRAFT_KEY}
			onSubmit={handleDuplicateStoreSubmit}
			onLogoChange={entityState.handleLogoChange}
			logoChanged={entityState.logoChanged}
			saving={entityState.creating}
		/>
	{/if}
</Modal>

<!-- Paste Store Modal -->
<Modal show={entityState.showPasteModal} title="Paste Store" onClose={entityState.closePaste} maxWidth="3xl">
	{#if duplicateStoreError}
		<MessageBanner type="error" message={duplicateStoreError} />
	{/if}
	{#if entityState.pasteData && schema}
		<StoreForm
			store={entityState.pasteData}
			{schema}
			draftKey={STORE_CREATE_DRAFT_KEY}
			onSubmit={handleDuplicateStoreSubmit}
			onLogoChange={entityState.handleLogoChange}
			logoChanged={entityState.logoChanged}
			saving={entityState.creating}
		/>
	{/if}
</Modal>

<!-- Cloud Compare Modal -->
<CloudCompareModal
	show={entityState.showCloudCompareModal}
	onClose={entityState.closeCloudCompare}
	title="Compare Store with Cloud"
	currentData={store}
	apiPath="/api/stores/{storeId}"
/>
