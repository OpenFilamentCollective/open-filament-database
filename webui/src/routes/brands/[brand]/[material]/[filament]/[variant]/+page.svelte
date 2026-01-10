<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import type { Variant } from '$lib/types/database';
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
	let variantSlug: string = $derived($page.params.variant!);
	let variant: Variant | null = $state(null);
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
			const [variantData, schemaData] = await Promise.all([
				apiFetch(`/api/brands/${brandId}/materials/${materialType}/filaments/${filamentId}/variants/${variantSlug}`).then(
					(r) => r.json()
				),
				apiFetch('/api/schemas/variant').then((r) => r.json())
			]);

			if (variantData.error) {
				error = 'Variant not found';
				loading = false;
				return;
			}

			variant = variantData;
			schema = schemaData;
			formData = { ...variant };
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load variant';
		} finally {
			loading = false;
		}
	});

	async function handleSubmit(data: any) {
		if (!variant) return;

		saving = true;
		error = null;
		successMessage = null;

		try {
			const response = await fetch(
				`/api/brands/${brandId}/materials/${materialType}/filaments/${filamentId}/variants/${variantSlug}`,
				{
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(data)
				}
			);

			if (response.ok) {
				variant = data;
				formData = { ...data };
				successMessage = 'Variant saved successfully!';
				editMode = false;

				setTimeout(() => {
					successMessage = null;
				}, 3000);
			} else {
				error = 'Failed to save variant';
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to save variant';
		} finally {
			saving = false;
		}
	}

	function toggleEditMode() {
		editMode = !editMode;
		if (editMode && variant && schema) {
			formData = { ...variant };
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
		if (variant) {
			formData = { ...variant };
		}
	}
</script>

<div class="container mx-auto px-4 py-8 max-w-4xl">
	<div class="mb-6">
		<BackButton
			href="/brands/{brandId}/{materialType}/{filamentId}"
			label="Filament"
		/>
	</div>

	{#if loading}
		<div class="flex justify-center items-center py-12">
			<div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
		</div>
	{:else if error && !variant}
		<div class="bg-red-50 border border-red-200 rounded-lg p-4">
			<p class="text-red-800">Error: {error}</p>
		</div>
	{:else if variant}
		<header class="mb-6">
			<div class="flex items-center gap-3 mb-2">
				<div
					class="w-12 h-12 rounded-full border-2 border-gray-300"
					style="background-color: {variant.color_hex}"
					title={variant.color_hex}
				></div>
				<div>
					<h1 class="text-3xl font-bold">{variant.color_name}</h1>
					{#if variant.discontinued}
						<span class="px-3 py-1 text-sm bg-red-100 text-red-800 rounded-full">Discontinued</span>
					{/if}
				</div>
			</div>
			<p class="text-gray-600">Variant ID: {variant.id}</p>
		</header>

		{#if successMessage}
			<MessageBanner type="success" message={successMessage} />
		{/if}

		{#if error}
			<MessageBanner type="error" message={`Error: ${error}`} />
		{/if}

		<EntityForm
			title="Variant Details"
			{editMode}
			{saving}
			{form}
			onEdit={toggleEditMode}
			onCancel={cancelEdit}
			editButtonClass="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 transition-colors"
		>
			{#snippet children()}
				<dl class="space-y-4">
					<div>
						<dt class="text-sm font-medium text-gray-500">Color Name</dt>
						<dd class="mt-1 text-lg">{variant.color_name}</dd>
					</div>
					<div>
						<dt class="text-sm font-medium text-gray-500">Slug</dt>
						<dd class="mt-1">{variant.slug}</dd>
					</div>
					<div>
						<dt class="text-sm font-medium text-gray-500">Color</dt>
						<dd class="mt-1 flex items-center gap-2">
							<div
								class="w-8 h-8 rounded border-2 border-gray-300"
								style="background-color: {variant.color_hex}"
							></div>
							<span class="font-mono">{variant.color_hex}</span>
						</dd>
					</div>
					<div>
						<dt class="text-sm font-medium text-gray-500">Status</dt>
						<dd class="mt-1">
							{variant.discontinued ? 'Discontinued' : 'Active'}
						</dd>
					</div>
				</dl>
			{/snippet}
		</EntityForm>
	{/if}
</div>
