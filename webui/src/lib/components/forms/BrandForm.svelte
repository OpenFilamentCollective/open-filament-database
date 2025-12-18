<script lang="ts">
	import { BrandSchema, type Brand } from '$lib/schemas/generated';
	import { addChange } from '$lib/stores/changes.svelte';

	interface Props {
		initialData?: Brand;
		brandPath: string;
		onSave?: () => void;
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

	function validate(): boolean {
		errors = {};
		const result = BrandSchema.safeParse(formData);

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
		addChange(operation, `${brandPath}/brand.json`, formData as Record<string, unknown>);

		isSubmitting = false;
		onSave?.();
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

	<div>
		<label for="logo" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
			Logo Filename *
		</label>
		<input
			type="text"
			id="logo"
			bind:value={formData.logo}
			placeholder="brand_logo.png"
			class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
			class:border-red-500={errors.logo}
		/>
		{#if errors.logo}
			<p class="mt-1 text-sm text-red-600">{errors.logo}</p>
		{/if}
	</div>

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
