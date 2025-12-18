<script lang="ts">
	import { z } from 'zod';
	import { BrandSchema, LimitedStringSchema, CountryCodeSchema, type Brand } from '$lib/schemas/generated';
	import { addChange } from '$lib/stores/changes.svelte';
	import LogoUpload from './LogoUpload.svelte';

	interface Props {
		initialData?: Brand;
		brandPath: string;
		onSave?: (newBrand: string) => void;
		onCancel?: () => void;
	}

	let { initialData, brandPath, onSave, onCancel }: Props = $props();

	let formData = $state<Partial<Brand>>({
		brand: initialData?.brand ?? '',
		website: initialData?.website ?? '',
		logo: initialData?.logo ?? '',
		origin: initialData?.origin ?? ''
	});

	let errors = $state<Record<string, string>>({});
	let isSubmitting = $state(false);

	// Custom schema that allows embedded content for logo (base64 or raw SVG which exceed the 1000 char limit)
	const isEmbeddedLogo = (val: string) =>
		val.startsWith('data:') || val.startsWith('<svg') || val.startsWith('<?xml');

	const FormBrandSchema = z.object({
		brand: LimitedStringSchema,
		website: LimitedStringSchema,
		logo: z.string().refine(
			(val) => isEmbeddedLogo(val) || val.length <= 1000,
			{ message: 'Logo filename must be 1000 characters or less' }
		),
		origin: CountryCodeSchema
	}).strict();

	function validate(): boolean {
		errors = {};
		const result = FormBrandSchema.safeParse(formData);

		if (!result.success) {
			for (const issue of result.error.issues) {
				const path = issue.path.join('.');
				errors[path] = issue.message;
			}
			return false;
		}

		return true;
	}

	function handleSubmit(e: Event) {
		e.preventDefault();
		isSubmitting = true;

		if (!validate()) {
			isSubmitting = false;
			return;
		}

		const operation = initialData ? 'update' : 'create';
		// For new brands, use the brand name as the path; for existing, use brandPath
		const path = brandPath || formData.brand;
		addChange(operation, `${path}/brand.json`, formData as Record<string, unknown>);

		isSubmitting = false;
		onSave?.(formData.brand ?? '');
	}
</script>

<form onsubmit={handleSubmit} class="space-y-4">
	<div>
		<label for="brand" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
			Brand Name *
		</label>
		<input
			type="text"
			id="brand"
			bind:value={formData.brand}
			class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
			class:border-red-500={errors.brand}
		/>
		{#if errors.brand}
			<p class="mt-1 text-sm text-red-600">{errors.brand}</p>
		{/if}
	</div>

	<div>
		<label for="website" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
			Website *
		</label>
		<input
			type="text"
			id="website"
			bind:value={formData.website}
			placeholder="example.com"
			class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
			class:border-red-500={errors.website}
		/>
		{#if errors.website}
			<p class="mt-1 text-sm text-red-600">{errors.website}</p>
		{/if}
	</div>

	<LogoUpload
		value={formData.logo ?? ''}
		onChange={(value) => (formData.logo = value)}
		error={errors.logo}
	/>

	<div>
		<label for="origin" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
			Country of Origin * (2-letter code)
		</label>
		<input
			type="text"
			id="origin"
			bind:value={formData.origin}
			placeholder="US"
			maxlength="2"
			class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
			class:border-red-500={errors.origin}
		/>
		{#if errors.origin}
			<p class="mt-1 text-sm text-red-600">{errors.origin}</p>
		{/if}
	</div>

	<div class="flex gap-2 pt-4">
		<button
			type="submit"
			disabled={isSubmitting}
			class="flex-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
		>
			{isSubmitting ? 'Saving...' : 'Save Changes'}
		</button>
		{#if onCancel}
			<button
				type="button"
				onclick={onCancel}
				class="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
			>
				Cancel
			</button>
		{/if}
	</div>
</form>
