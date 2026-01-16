<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import type { Material, Filament } from '$lib/types/database';
	import { createForm, BasicForm } from '@sjsf/form';
	import { formDefaults } from '$lib/utils/formDefaults';
	import { createUiSchema, applyFormattedTitles, removeIdFromSchema } from '$lib/utils/schemaUtils';
	import { customTranslation } from '$lib/utils/translations';
	import '@sjsf/basic-theme/css/basic.css';
	import '$lib/styles/sjsf-buttons.css';
	import { Modal, MessageBanner } from '$lib/components/ui';
	import { MaterialForm } from '$lib/components/forms';
	import { BackButton } from '$lib/components/actions';
	import { DataDisplay } from '$lib/components/layout';
	import { EntityDetails, EntityCard } from '$lib/components/entity';
	import { createMessageHandler } from '$lib/utils/messageHandler.svelte';
	import { db } from '$lib/services/database';
	import { apiFetch } from '$lib/utils/api';
	import { isCloudMode } from '$lib/stores/environment';
	import { changeStore } from '$lib/stores/changes';

	let brandId: string = $derived($page.params.brand!);
	let materialType: string = $derived($page.params.material!);
	let material: Material | null = $state(null);
	let filaments: Filament[] = $state([]);
	let filamentSchema: any = $state(null);
	let loading: boolean = $state(true);
	let saving: boolean = $state(false);
	let error: string | null = $state(null);

	let showEditModal: boolean = $state(false);
	let showDeleteModal: boolean = $state(false);
	let showCreateFilamentModal: boolean = $state(false);
	let deleting: boolean = $state(false);
	let creatingFilament: boolean = $state(false);
	let filamentForm: any = $state(null);

	// Create message handler
	const messageHandler = createMessageHandler();

	onMount(async () => {
		try {
			// Use DatabaseService for material and filaments to apply pending changes
			const [materialData, filamentsData] = await Promise.all([
				db.getMaterial(brandId, materialType),
				db.loadFilaments(brandId, materialType)
			]);

			if (!materialData) {
				error = 'Material not found';
				loading = false;
				return;
			}

			material = materialData;
			filaments = filamentsData;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load material';
		} finally {
			loading = false;
		}
	});

	async function handleSubmit(data: any) {
		if (!material) return;

		saving = true;
		messageHandler.clear();

		try {
			// Preserve materialType from original material since form doesn't include it
			const updatedMaterial = {
				...data,
				materialType: material.materialType ?? materialType
			};

			// Use DatabaseService for saving (handles cloud vs local mode)
			const success = await db.saveMaterial(brandId, materialType, updatedMaterial, material);

			if (success) {
				material = updatedMaterial;
				messageHandler.showSuccess('Material saved successfully!');
				showEditModal = false;
			} else {
				messageHandler.showError('Failed to save material');
			}
		} catch (e) {
			messageHandler.showError(e instanceof Error ? e.message : 'Failed to save material');
		} finally {
			saving = false;
		}
	}

	function openEditModal() {
		showEditModal = true;
	}

	function closeEditModal() {
		showEditModal = false;
	}

	function openDeleteModal() {
		showDeleteModal = true;
	}

	function closeDeleteModal() {
		showDeleteModal = false;
	}

	async function handleDelete() {
		if (!material) return;

		deleting = true;
		messageHandler.clear();

		try {
			if ($isCloudMode) {
				const entityPath = `brands/${brandId}/materials/${materialType}`;
				const change = $changeStore.changes[entityPath];

				if (change && change.operation === 'create') {
					changeStore.removeChange(entityPath);
					messageHandler.showSuccess('Local material creation removed');
				} else {
					await db.deleteMaterial(brandId, materialType, material);
					messageHandler.showSuccess('Material marked for deletion - export to save');
				}
			} else {
				const success = await db.deleteMaterial(brandId, materialType, material);
				if (success) {
					messageHandler.showSuccess('Material deleted successfully');
				} else {
					messageHandler.showError('Failed to delete material');
					deleting = false;
					showDeleteModal = false;
					return;
				}
			}

			showDeleteModal = false;
			setTimeout(() => {
				window.location.href = `/brands/${brandId}`;
			}, 1500);
		} catch (e) {
			messageHandler.showError(e instanceof Error ? e.message : 'Failed to delete material');
			deleting = false;
			showDeleteModal = false;
		}
	}

	async function openCreateFilamentModal() {
		showCreateFilamentModal = true;
		if (!filamentSchema) {
			try {
				const response = await apiFetch('/api/schemas/filament');
				filamentSchema = await response.json();
			} catch (e) {
				console.error('Failed to load filament schema:', e);
				messageHandler.showError('Failed to load filament schema');
				showCreateFilamentModal = false;
				return;
			}
		}

		let processedSchema = removeIdFromSchema(filamentSchema);
		processedSchema = applyFormattedTitles(processedSchema);

		filamentForm = createForm({
			...formDefaults,
			schema: processedSchema,
			uiSchema: createUiSchema(),
			translation: customTranslation,
			initialValue: { name: '', density: 1.24, diameter_tolerance: 0.02 },
			onSubmit: handleCreateFilament
		});
	}

	function closeCreateFilamentModal() {
		showCreateFilamentModal = false;
		filamentForm = null;
	}

	async function handleCreateFilament(data: any) {
		creatingFilament = true;
		messageHandler.clear();

		try {
			const result = await db.createFilament(brandId, materialType, data);

			if (result.success && result.filamentId) {
				messageHandler.showSuccess('Filament created successfully!');
				showCreateFilamentModal = false;
				filamentForm = null;

				setTimeout(() => {
					window.location.reload();
				}, 500);
			} else {
				messageHandler.showError('Failed to create filament');
			}
		} catch (e) {
			messageHandler.showError(e instanceof Error ? e.message : 'Failed to create filament');
		} finally {
			creatingFilament = false;
		}
	}
</script>

<svelte:head>
	<title>{material ? `${material.material}` : 'Material Not Found'}</title>
</svelte:head>

<div class="container mx-auto px-4 py-8 max-w-6xl">
	<BackButton href="/brands/{brandId}" label="Brand" />

	<DataDisplay {loading} {error} data={material}>
		{#snippet children(materialData)}
			<header class="mb-6">
				<h1 class="text-3xl font-bold mb-2">{materialData.material}</h1>
				<p class="text-gray-600">Material Type: {materialType}</p>
			</header>

			{#if messageHandler.message}
				<MessageBanner type={messageHandler.type} message={messageHandler.message} />
			{/if}

			<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
				<EntityDetails
					entity={materialData}
					title="Material Details"
					fields={[
						{ key: 'material' },
						{
							key: 'material_class',
							label: 'Material Class',
							hide: (v) => !v
						},
						{
							key: 'default_max_dry_temperature',
							label: 'Max Dry Temperature',
							format: (v) => `${v}°C`,
							hide: (v) => !v
						}
					]}
				>
					{#snippet actions()}
						<div class="flex gap-2">
							<button
								onclick={openEditModal}
								class="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors"
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

				<div class="bg-white border border-gray-200 rounded-lg p-6">
					<div class="flex justify-between items-center mb-4">
						<h2 class="text-xl font-semibold">Filaments</h2>
						<button
							onclick={openCreateFilamentModal}
							class="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-3 py-1.5 rounded text-sm transition-colors flex items-center gap-1"
						>
							<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
								<path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" />
							</svg>
							Add Filament
						</button>
					</div>

					{#if filaments.length === 0}
						<p class="text-gray-500">No filaments found for this material.</p>
					{:else}
						<div class="space-y-2">
							{#each filaments as filament}
								{@const filamentHref = `/brands/${brandId}/${materialType}/${filament.slug ?? filament.id}`}
								<EntityCard
									entity={filament}
									href={filamentHref}
									name={filament.name}
									id={filament.slug ?? filament.id}
									hoverColor="blue"
									showLogo={false}
									badge={filament.discontinued
										? { text: 'Discontinued', color: 'red' }
										: undefined}
								/>
							{/each}
						</div>
					{/if}
				</div>
			</div>
		{/snippet}
	</DataDisplay>
</div>

<Modal show={showEditModal} title="Edit Material" onClose={closeEditModal} maxWidth="5xl" height="1/2">
	{#if material}
		<MaterialForm
			{material}
			onSubmit={handleSubmit}
			{saving}
		/>
	{/if}
</Modal>

<Modal show={showDeleteModal} title="Delete Material" onClose={closeDeleteModal} maxWidth="md">
	{#if material}
		<div class="space-y-4">
			<p class="text-gray-700">
				Are you sure you want to delete the material <strong>{material.material}</strong>?
			</p>
			<p class="text-gray-600 text-sm">
				This will also delete all filaments and variants within this material.
			</p>

			{#if $isCloudMode}
				<div class="bg-blue-50 border border-blue-200 rounded p-3">
					<p class="text-sm text-blue-800">
						{#if $changeStore.changes[`brands/${brandId}/materials/${materialType}`]?.operation === 'create'}
							This will remove the locally created material. The change will be discarded.
						{:else}
							This will mark the material for deletion. Remember to export your changes.
						{/if}
					</p>
				</div>
			{:else}
				<div class="bg-red-50 border border-red-200 rounded p-3">
					<p class="text-sm text-red-800">
						This action cannot be undone. The material and all its contents will be permanently deleted.
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
					{deleting ? 'Deleting...' : 'Delete Material'}
				</button>
			</div>
		</div>
	{/if}
</Modal>

<Modal show={showCreateFilamentModal} title="Create New Filament" onClose={closeCreateFilamentModal} maxWidth="3xl">
	{#if filamentForm}
		<div class="space-y-4">
			<BasicForm form={filamentForm} />
			{#if creatingFilament}
				<div class="flex justify-center">
					<div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
				</div>
			{/if}
		</div>
	{:else}
		<div class="flex justify-center items-center py-12">
			<div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
		</div>
	{/if}
</Modal>
