<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import type { Material, Filament } from '$lib/types/database';
	import { createForm, BasicForm } from '@sjsf/form';
	import { formDefaults } from '$lib/utils/formDefaults';
	import { createUiSchema, applyFormattedTitles } from '$lib/utils/schemaUtils';
	import { customTranslation } from '$lib/utils/translations';
	import '@sjsf/basic-theme/css/basic.css';
	import '$lib/styles/sjsf-buttons.css';
	import BackButton from '$lib/components/BackButton.svelte';

	let brandId: string = $derived($page.params.brand!);
	let materialType: string = $derived($page.params.material!);
	let material: Material | null = $state(null);
	let filaments: Filament[] = $state([]);
	let schema: any = $state(null);
	let loading: boolean = $state(true);
	let saving: boolean = $state(false);
	let error: string | null = $state(null);
	let successMessage: string | null = $state(null);

	let editMode: boolean = $state(false);
	let formData: any = $state({});
	let form: any = $state(null);

	onMount(async () => {
		try {
			const { apiFetch } = await import('$lib/utils/api');
			const [materialData, filamentsData, schemaData] = await Promise.all([
				apiFetch(`/api/brands/${brandId}/materials/${materialType}`).then((r) => r.json()),
				apiFetch(`/api/brands/${brandId}/materials/${materialType}/filaments`).then((r) => r.json()),
				apiFetch('/api/schemas/material').then((r) => r.json())
			]);

			if (materialData.error) {
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
		error = null;
		successMessage = null;

		try {
			const response = await fetch(`/api/brands/${brandId}/materials/${materialType}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(data)
			});

			if (response.ok) {
				material = data;
				formData = { ...data };
				successMessage = 'Material saved successfully!';
				editMode = false;

				setTimeout(() => {
					successMessage = null;
				}, 3000);
			} else {
				error = 'Failed to save material';
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to save material';
		} finally {
			saving = false;
		}
	}

	function toggleEditMode() {
		editMode = !editMode;
		if (editMode && material && schema) {
			formData = { ...material };
			const formattedSchema = applyFormattedTitles(schema);
			form = createForm({
				...formDefaults,
				schema: formattedSchema,
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

<div class="container mx-auto px-4 py-8 max-w-6xl">
	<BackButton
		href="/brands/{brandId}"
		label="Brands"
	/>

	{#if loading}
		<div class="flex justify-center items-center py-12">
			<div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
		</div>
	{:else if error && !material}
		<div class="bg-red-50 border border-red-200 rounded-lg p-4">
			<p class="text-red-800">Error: {error}</p>
		</div>
	{:else if material}
		<header class="mb-6">
			<h1 class="text-3xl font-bold mb-2">{material.material}</h1>
			<p class="text-gray-600">Material Type: {materialType}</p>
		</header>

		{#if successMessage}
			<div class="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
				<p class="text-green-800">{successMessage}</p>
			</div>
		{/if}

		{#if error}
			<div class="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
				<p class="text-red-800">Error: {error}</p>
			</div>
		{/if}

		<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
			<div class="bg-white border border-gray-200 rounded-lg p-6">
				{#if !editMode}
					<div class="mb-6">
						<div class="flex justify-between items-center mb-4">
							<h2 class="text-xl font-semibold">Material Details</h2>
							<button
								onclick={toggleEditMode}
								class="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors"
							>
								Edit
							</button>
						</div>

						<dl class="space-y-4">
							<div>
								<dt class="text-sm font-medium text-gray-500">Material</dt>
								<dd class="mt-1 text-lg">{material.material}</dd>
							</div>
							{#if material.material_class}
								<div>
									<dt class="text-sm font-medium text-gray-500">Material Class</dt>
									<dd class="mt-1">{material.material_class}</dd>
								</div>
							{/if}
							{#if material.default_max_dry_temperature}
								<div>
									<dt class="text-sm font-medium text-gray-500">Max Dry Temperature</dt>
									<dd class="mt-1">{material.default_max_dry_temperature}°C</dd>
								</div>
							{/if}
						</dl>
					</div>
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
							<a
								href="/brands/{brandId}/{materialType}/{filament.filamentDir}"
								class="block p-4 border border-gray-200 rounded hover:border-blue-500 hover:shadow-md transition-all"
							>
								<div class="flex items-center justify-between">
									<div>
										<h3 class="font-semibold">{filament.name}</h3>
										<p class="text-xs text-gray-500">{filament.id}</p>
										{#if filament.discontinued}
											<span
												class="inline-block mt-1 px-2 py-1 text-xs bg-red-100 text-red-800 rounded"
											>
												Discontinued
											</span>
										{/if}
									</div>
									<span class="text-gray-400">→</span>
								</div>
							</a>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>
