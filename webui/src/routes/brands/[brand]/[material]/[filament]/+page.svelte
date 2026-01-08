<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import type { Filament, Variant } from '$lib/types/database';
	import { createForm, BasicForm } from '@sjsf/form';
	import { formDefaults } from '$lib/utils/formDefaults';
	import { createUiSchema, removeIdFromSchema, applyFormattedTitles } from '$lib/utils/schemaUtils';
	import { customTranslation } from '$lib/utils/translations';
	import EntityForm from '$lib/components/EntityForm.svelte';
	import MessageBanner from '$lib/components/MessageBanner.svelte';
	import BackButton from '$lib/components/BackButton.svelte';
	import '@sjsf/basic-theme/css/basic.css';
	import '$lib/styles/sjsf-buttons.css';

	let brandId: string = $derived($page.params.brand!);
	let materialType: string = $derived($page.params.material!);
	let filamentId: string = $derived($page.params.filament!);
	let filament: Filament | null = $state(null);
	let variants: Variant[] = $state([]);
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
			const [filamentData, variantsData, schemaData] = await Promise.all([
				apiFetch(`/api/brands/${brandId}/materials/${materialType}/filaments/${filamentId}`).then(
					(r) => r.json()
				),
				apiFetch(`/api/brands/${brandId}/materials/${materialType}/filaments/${filamentId}/variants`).then(
					(r) => r.json()
				),
				apiFetch('/api/schemas/filament').then((r) => r.json())
			]);

			if (filamentData.error) {
				error = 'Filament not found';
				loading = false;
				return;
			}

			filament = filamentData;
			variants = variantsData || [];
			schema = schemaData;
			formData = { ...filament };
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load filament';
		} finally {
			loading = false;
		}
	});

	async function handleSubmit(data: any) {
		if (!filament) return;

		saving = true;
		error = null;
		successMessage = null;

		try {
			const response = await fetch(
				`/api/brands/${brandId}/materials/${materialType}/filaments/${filamentId}`,
				{
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(data)
				}
			);

			if (response.ok) {
				filament = data;
				formData = { ...data };
				successMessage = 'Filament saved successfully!';
				editMode = false;

				setTimeout(() => {
					successMessage = null;
				}, 3000);
			} else {
				error = 'Failed to save filament';
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to save filament';
		} finally {
			saving = false;
		}
	}

	function toggleEditMode() {
		editMode = !editMode;
		if (editMode && filament && schema) {
			formData = { ...filament };
			let editSchema = removeIdFromSchema(schema);
			editSchema = applyFormattedTitles(editSchema);
			form = createForm({
				...formDefaults,
				schema: editSchema,
				uiSchema: createUiSchema(),
				translation: customTranslation,
				initialValue: formData,
				onSubmit: handleSubmit
			});
		}
	}

	function cancelEdit() {
		editMode = false;
		if (filament) {
			formData = { ...filament };
		}
	}
</script>

<div class="container mx-auto px-4 py-8 max-w-6xl">
	<div class="mb-6">
		<BackButton
			href="/brands/{brandId}/{materialType}"
			label="Material"
		/>
	</div>

	{#if loading}
		<div class="flex justify-center items-center py-12">
			<div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
		</div>
	{:else if error && !filament}
		<div class="bg-red-50 border border-red-200 rounded-lg p-4">
			<p class="text-red-800">Error: {error}</p>
		</div>
	{:else if filament}
		<header class="mb-6">
			<div class="flex items-center gap-3 mb-2">
				<h1 class="text-3xl font-bold">{filament.name}</h1>
				{#if filament.discontinued}
					<span class="px-3 py-1 text-sm bg-red-100 text-red-800 rounded-full">Discontinued</span>
				{/if}
			</div>
			<p class="text-gray-600">Filament ID: {filament.id}</p>
		</header>

		{#if successMessage}
			<MessageBanner type="success" message={successMessage} />
		{/if}

		{#if error}
			<MessageBanner type="error" message={`Error: ${error}`} />
		{/if}

		<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
			<EntityForm
				title="Filament Details"
				{editMode}
				{saving}
				{form}
				onEdit={toggleEditMode}
				onCancel={cancelEdit}
			>
				{#snippet children()}
					<dl class="space-y-4">
						<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
							<div>
								<dt class="text-sm font-medium text-gray-500">Name</dt>
								<dd class="mt-1 text-lg">{filament.name}</dd>
							</div>
							<div>
								<dt class="text-sm font-medium text-gray-500">Density</dt>
								<dd class="mt-1">{filament.density} g/cm³</dd>
							</div>
							<div>
								<dt class="text-sm font-medium text-gray-500">Diameter Tolerance</dt>
								<dd class="mt-1">{filament.diameter_tolerance} mm</dd>
							</div>
							{#if filament.min_print_temperature}
								<div>
									<dt class="text-sm font-medium text-gray-500">Print Temperature Range</dt>
									<dd class="mt-1">
										{filament.min_print_temperature}°C - {filament.max_print_temperature}°C
									</dd>
								</div>
							{/if}
							{#if filament.min_bed_temperature}
								<div>
									<dt class="text-sm font-medium text-gray-500">Bed Temperature Range</dt>
									<dd class="mt-1">
										{filament.min_bed_temperature}°C - {filament.max_bed_temperature}°C
									</dd>
								</div>
							{/if}
							{#if filament.preheat_temperature}
								<div>
									<dt class="text-sm font-medium text-gray-500">Preheat Temperature</dt>
									<dd class="mt-1">{filament.preheat_temperature}°C</dd>
								</div>
							{/if}
							{#if filament.shore_hardness_a}
								<div>
									<dt class="text-sm font-medium text-gray-500">Shore Hardness A</dt>
									<dd class="mt-1">{filament.shore_hardness_a}</dd>
								</div>
							{/if}
							{#if filament.shore_hardness_d}
								<div>
									<dt class="text-sm font-medium text-gray-500">Shore Hardness D</dt>
									<dd class="mt-1">{filament.shore_hardness_d}</dd>
								</div>
							{/if}
							{#if filament.max_dry_temperature}
								<div>
									<dt class="text-sm font-medium text-gray-500">Max Dry Temperature</dt>
									<dd class="mt-1">{filament.max_dry_temperature}°C</dd>
								</div>
							{/if}
							{#if filament.min_nozzle_diameter}
								<div>
									<dt class="text-sm font-medium text-gray-500">Min Nozzle Diameter</dt>
									<dd class="mt-1">{filament.min_nozzle_diameter} mm</dd>
								</div>
							{/if}
						</div>

						{#if filament.certifications && filament.certifications.length > 0}
							<div>
								<dt class="text-sm font-medium text-gray-500">Certifications</dt>
								<dd class="mt-1">
									<div class="flex flex-wrap gap-2">
										{#each filament.certifications as cert}
											<span class="px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm"
												>{cert}</span
											>
										{/each}
									</div>
								</dd>
							</div>
						{/if}

						{#if filament.data_sheet_url}
							<div>
								<dt class="text-sm font-medium text-gray-500">Data Sheet</dt>
								<dd class="mt-1">
									<a
										href={filament.data_sheet_url}
										target="_blank"
										class="text-blue-600 hover:underline"
									>
										{filament.data_sheet_url}
									</a>
								</dd>
							</div>
						{/if}

						{#if filament.safety_sheet_url}
							<div>
								<dt class="text-sm font-medium text-gray-500">Safety Sheet</dt>
								<dd class="mt-1">
									<a
										href={filament.safety_sheet_url}
										target="_blank"
										class="text-blue-600 hover:underline"
									>
										{filament.safety_sheet_url}
									</a>
								</dd>
							</div>
						{/if}
					</dl>
				{/snippet}
			</EntityForm>

			<div class="bg-white border border-gray-200 rounded-lg p-6">
				<div class="flex justify-between items-center mb-4">
					<h2 class="text-xl font-semibold">Variants</h2>
					<a
						href="/brands/{brandId}/{materialType}/{filamentId}/new"
						class="bg-orange-600 hover:bg-orange-700 text-white font-semibold px-3 py-1.5 rounded text-sm transition-colors flex items-center gap-1"
					>
						<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
							<path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" />
						</svg>
						Add Variant
					</a>
				</div>

				{#if variants.length === 0}
					<p class="text-gray-500">No variants found for this filament.</p>
				{:else}
					<div class="space-y-2">
						{#each variants as variant}
							<a
								href="/brands/{brandId}/{materialType}/{filamentId}/{variant.slug}"
								class="block p-4 border border-gray-200 rounded hover:border-orange-500 hover:shadow-md transition-all"
							>
								<div class="flex items-center justify-between">
									<div class="flex items-center gap-3">
										<div
											class="w-8 h-8 rounded-full border-2 border-gray-300"
											style="background-color: {variant.color_hex}"
											title={variant.color_hex}
										></div>
										<div>
											<h3 class="font-semibold">{variant.color_name}</h3>
											<p class="text-xs text-gray-500">{variant.slug}</p>
											{#if variant.discontinued}
												<span
													class="inline-block mt-1 px-2 py-1 text-xs bg-red-100 text-red-800 rounded"
												>
													Discontinued
												</span>
											{/if}
										</div>
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
