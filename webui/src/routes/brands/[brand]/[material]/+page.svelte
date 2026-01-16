<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import type { Material, Filament } from '$lib/types/database';
	import { createForm, BasicForm } from '@sjsf/form';
	import { formDefaults } from '$lib/utils/formDefaults';
	import {
		createUiSchema,
		applyFormattedTitles,
		resolveExternalReferences
	} from '$lib/utils/schemaUtils';
	import { customTranslation } from '$lib/utils/translations';
	import '@sjsf/basic-theme/css/basic.css';
	import '$lib/styles/sjsf-buttons.css';
	import BackButton from '$lib/components/BackButton.svelte';
	import DataDisplay from '$lib/components/DataDisplay.svelte';
	import EntityDetails from '$lib/components/EntityDetails.svelte';
	import EntityCard from '$lib/components/EntityCard.svelte';
	import MessageBanner from '$lib/components/MessageBanner.svelte';
	import { createMessageHandler } from '$lib/utils/messageHandler.svelte';
	import { db } from '$lib/services/database';
	import { apiFetch } from '$lib/utils/api';

	let brandId: string = $derived($page.params.brand!);
	let materialType: string = $derived($page.params.material!);
	let material: Material | null = $state(null);
	let filaments: Filament[] = $state([]);
	let schema: any = $state(null);
	let loading: boolean = $state(true);
	let saving: boolean = $state(false);
	let error: string | null = $state(null);

	let editMode: boolean = $state(false);
	let formData: any = $state({});
	let form: any = $state(null);

	// Create message handler
	const messageHandler = createMessageHandler();

	onMount(async () => {
		try {
			// Use DatabaseService for material and filaments to apply pending changes
			const [materialData, filamentsData, schemaData] = await Promise.all([
				db.getMaterial(brandId, materialType),
				db.loadFilaments(brandId, materialType),
				apiFetch('/api/schemas/material').then((r) => r.json())
			]);

			if (!materialData) {
				error = 'Material not found';
				loading = false;
				return;
			}

			material = materialData;
			filaments = filamentsData;
			schema = schemaData;
			formData = { ...material };
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
				formData = { ...updatedMaterial };
				messageHandler.showSuccess('Material saved successfully!');
				editMode = false;
			} else {
				messageHandler.showError('Failed to save material');
			}
		} catch (e) {
			messageHandler.showError(e instanceof Error ? e.message : 'Failed to save material');
		} finally {
			saving = false;
		}
	}

	function toggleEditMode() {
		editMode = !editMode;
		if (editMode && material && schema) {
			formData = { ...material };
			// Resolve external references first, then apply formatting
			let processedSchema = resolveExternalReferences(schema);
			processedSchema = applyFormattedTitles(processedSchema);
			form = createForm({
				...formDefaults,
				schema: processedSchema,
				uiSchema: createUiSchema(),
				translation: customTranslation,
				initialValue: formData,
				onSubmit: handleSubmit
			});
		}
	}

	function cancelEdit() {
		editMode = false;
		if (material) {
			formData = { ...material };
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
				<div class="bg-white border border-gray-200 rounded-lg p-6">
					{#if !editMode}
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
								<button
									onclick={toggleEditMode}
									class="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors"
								>
									Edit
								</button>
							{/snippet}
						</EntityDetails>
					{:else}
						<div>
							<div class="flex justify-between items-center mb-4">
								<h2 class="text-xl font-semibold">Edit Material</h2>
								<button
									onclick={cancelEdit}
									class="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 transition-colors"
									disabled={saving}
								>
									Cancel
								</button>
							</div>

							{#if form}
								<BasicForm {form} />
							{/if}
						</div>
					{/if}
				</div>

				<div class="bg-white border border-gray-200 rounded-lg p-6">
					<h2 class="text-xl font-semibold mb-4">Filaments</h2>

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
