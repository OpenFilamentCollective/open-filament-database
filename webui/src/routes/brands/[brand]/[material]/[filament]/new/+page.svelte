<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import type { Variant } from '$lib/types/database';
	import { createForm, BasicForm } from '@sjsf/form';
	import { formDefaults } from '$lib/utils/formDefaults';
	import { createUiSchema, removeIdFromSchema, applyFormattedTitles } from '$lib/utils/schemaUtils';
	import { customTranslation } from '$lib/utils/translations';
	import { MessageBanner } from '$lib/components/ui';
	import { BackButton } from '$lib/components/actions';
	import { createMessageHandler } from '$lib/utils/messageHandler.svelte';
	import { db } from '$lib/services/database';
	import { apiFetch } from '$lib/utils/api';
	import '@sjsf/basic-theme/css/basic.css';
	import '$lib/styles/sjsf-buttons.css';

	let brandId: string = $derived($page.params.brand!);
	let materialType: string = $derived($page.params.material!);
	let filamentId: string = $derived($page.params.filament!);

	let schema: any = $state(null);
	let loading: boolean = $state(true);
	let saving: boolean = $state(false);
	let error: string | null = $state(null);
	let form: any = $state(null);

	const messageHandler = createMessageHandler();

	// Load schema on mount
	$effect(() => {
		const params = { brandId, materialType, filamentId };

		loading = true;
		error = null;

		(async () => {
			try {
				const schemaData = await apiFetch('/api/schemas/variant').then((r) => r.json());
				schema = schemaData;

				let processedSchema = removeIdFromSchema(schema);
				processedSchema = applyFormattedTitles(processedSchema);

				// Set default values for new variant
				const initialValue: Partial<Variant> = {
					color_name: '',
					color_hex: '#000000',
					discontinued: false
				};

				form = createForm({
					...formDefaults,
					schema: processedSchema,
					uiSchema: createUiSchema(),
					translation: customTranslation,
					initialValue,
					onSubmit: handleSubmit
				});
			} catch (e) {
				error = e instanceof Error ? e.message : 'Failed to load schema';
			} finally {
				loading = false;
			}
		})();
	});

	async function handleSubmit(data: any) {
		saving = true;
		messageHandler.clear();

		try {
			const result = await db.createVariant(brandId, materialType, filamentId, data);

			if (result.success && result.variantSlug) {
				messageHandler.showSuccess('Variant created successfully!');

				// Navigate to the new variant page
				setTimeout(() => {
					goto(`/brands/${brandId}/${materialType}/${filamentId}/${result.variantSlug}`);
				}, 500);
			} else {
				messageHandler.showError('Failed to create variant');
			}
		} catch (e) {
			messageHandler.showError(e instanceof Error ? e.message : 'Failed to create variant');
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head>
	<title>New Variant</title>
</svelte:head>

<div class="container mx-auto px-4 py-8 max-w-4xl">
	<div class="mb-6">
		<BackButton href="/brands/{brandId}/{materialType}/{filamentId}" label="Filament" />
	</div>

	<header class="mb-6">
		<h1 class="text-3xl font-bold mb-2">New Variant</h1>
		<p class="text-gray-600">Create a new color variant for this filament</p>
	</header>

	{#if messageHandler.message}
		<MessageBanner type={messageHandler.type} message={messageHandler.message} />
	{/if}

	{#if loading}
		<div class="flex justify-center items-center py-12">
			<div class="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600"></div>
		</div>
	{:else if error}
		<div class="bg-red-50 border border-red-200 rounded p-4">
			<p class="text-red-800">{error}</p>
		</div>
	{:else if form}
		<div class="bg-white border border-gray-200 rounded-lg p-6">
			<BasicForm {form} />

			{#if saving}
				<div class="flex justify-center mt-4">
					<div class="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600"></div>
				</div>
			{/if}
		</div>
	{/if}
</div>
