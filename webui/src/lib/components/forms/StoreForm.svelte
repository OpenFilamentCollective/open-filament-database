<script lang="ts">
	import { z } from 'zod';
	import { StoreSchema, LimitedStringSchema, CountryCodeSchema, type Store } from '$lib/schemas/generated';
	import { addChange } from '$lib/stores/changes.svelte';
	import LogoUpload from './LogoUpload.svelte';

	interface Props {
		initialData?: Store;
		storeId: string;
		onSave?: (newStoreId: string) => void;
		onCancel?: () => void;
	}

	let { initialData, storeId, onSave, onCancel }: Props = $props();

	let formData = $state<Partial<Store>>({
		id: initialData?.id ?? '',
		name: initialData?.name ?? '',
		storefront_url: initialData?.storefront_url ?? '',
		storefront_affiliate_link: initialData?.storefront_affiliate_link ?? null,
		logo: initialData?.logo ?? ''
	});

	// Handle ships_from and ships_to as arrays
	function parseCountries(value: string | string[] | undefined): string[] {
		if (!value) return [''];
		if (Array.isArray(value)) return value.length > 0 ? value : [''];
		return [value];
	}

	let shipsFrom = $state<string[]>(parseCountries(initialData?.ships_from));
	let shipsTo = $state<string[]>(parseCountries(initialData?.ships_to));

	function addShipsFrom() {
		shipsFrom = [...shipsFrom, ''];
	}

	function removeShipsFrom(index: number) {
		if (shipsFrom.length > 1) {
			shipsFrom = shipsFrom.filter((_, i) => i !== index);
		}
	}

	function addShipsTo() {
		shipsTo = [...shipsTo, ''];
	}

	function removeShipsTo(index: number) {
		if (shipsTo.length > 1) {
			shipsTo = shipsTo.filter((_, i) => i !== index);
		}
	}

	let errors = $state<Record<string, string>>({});
	let isSubmitting = $state(false);

	// Custom schema that allows embedded content for logo
	const isEmbeddedLogo = (val: string) =>
		val.startsWith('data:') || val.startsWith('<svg') || val.startsWith('<?xml');

	const FormStoreSchema = z.object({
		id: LimitedStringSchema,
		name: LimitedStringSchema,
		storefront_url: LimitedStringSchema,
		storefront_affiliate_link: LimitedStringSchema.nullish(),
		logo: z.string().refine(
			(val) => isEmbeddedLogo(val) || val.length <= 1000,
			{ message: 'Logo filename must be 1000 characters or less' }
		),
		ships_from: z.union([z.array(CountryCodeSchema), CountryCodeSchema]),
		ships_to: z.union([z.array(CountryCodeSchema), CountryCodeSchema])
	}).strict();

	function validate(): boolean {
		errors = {};
		const result = FormStoreSchema.safeParse(formData);

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

		// Build the ships arrays
		const validShipsFrom = shipsFrom.map(s => s.trim().toUpperCase()).filter(s => s.length > 0);
		const validShipsTo = shipsTo.map(s => s.trim().toUpperCase()).filter(s => s.length > 0);

		// Build complete form data with ships arrays
		const submitData = {
			...formData,
			ships_from: validShipsFrom.length === 1 ? validShipsFrom[0] : validShipsFrom,
			ships_to: validShipsTo.length === 1 ? validShipsTo[0] : validShipsTo
		};

		// Validate with the complete data
		const result = FormStoreSchema.safeParse(submitData);
		if (!result.success) {
			errors = {};
			for (const issue of result.error.issues) {
				const path = issue.path.join('.');
				errors[path] = issue.message;
			}
			isSubmitting = false;
			return;
		}

		const operation = initialData ? 'update' : 'create';
		const effectiveStoreId = formData.id || storeId;
		addChange(operation, `stores/${effectiveStoreId}/store.json`, submitData as Record<string, unknown>);

		isSubmitting = false;
		onSave?.(effectiveStoreId);
	}

	function handleLogoChange(value: string) {
		formData.logo = value;
	}
</script>

<form onsubmit={handleSubmit} class="space-y-4">
	<div>
		<label for="id" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
			Store ID *
		</label>
		<input
			type="text"
			id="id"
			bind:value={formData.id}
			placeholder="unique-store-id"
			class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
			class:border-red-500={errors.id}
		/>
		{#if errors.id}
			<p class="mt-1 text-sm text-red-600">{errors.id}</p>
		{/if}
	</div>

	<div>
		<label for="name" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
			Store Name *
		</label>
		<input
			type="text"
			id="name"
			bind:value={formData.name}
			placeholder="My Filament Store"
			class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
			class:border-red-500={errors.name}
		/>
		{#if errors.name}
			<p class="mt-1 text-sm text-red-600">{errors.name}</p>
		{/if}
	</div>

	<div>
		<label for="storefront_url" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
			Storefront URL *
		</label>
		<input
			type="url"
			id="storefront_url"
			bind:value={formData.storefront_url}
			placeholder="https://store.example.com"
			class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
			class:border-red-500={errors.storefront_url}
		/>
		{#if errors.storefront_url}
			<p class="mt-1 text-sm text-red-600">{errors.storefront_url}</p>
		{/if}
	</div>

	<div>
		<label for="storefront_affiliate_link" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
			Affiliate Link (optional)
		</label>
		<input
			type="url"
			id="storefront_affiliate_link"
			bind:value={formData.storefront_affiliate_link}
			placeholder="https://store.example.com?ref=affiliate"
			class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
		/>
	</div>

	<LogoUpload value={formData.logo ?? ''} onChange={handleLogoChange} error={errors.logo} />

	<div class="grid grid-cols-2 gap-4">
		<div class="space-y-2">
			<div class="flex items-center justify-between">
				<label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
					Ships From (Country Code) *
				</label>
				<button
					type="button"
					onclick={addShipsFrom}
					class="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400"
				>
					+ Add
				</button>
			</div>
			{#each shipsFrom as country, index}
				<div class="flex items-center gap-2">
					<input
						type="text"
						bind:value={shipsFrom[index]}
						placeholder="US"
						maxlength="2"
						class="block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white font-mono uppercase"
						class:border-red-500={errors.ships_from}
					/>
					{#if shipsFrom.length > 1}
						<button
							type="button"
							onclick={() => removeShipsFrom(index)}
							class="p-1 text-gray-400 hover:text-red-600"
						>
							<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
							</svg>
						</button>
					{/if}
				</div>
			{/each}
			{#if errors.ships_from}
				<p class="text-sm text-red-600">{errors.ships_from}</p>
			{/if}
		</div>

		<div class="space-y-2">
			<div class="flex items-center justify-between">
				<label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
					Ships To (Country Code) *
				</label>
				<button
					type="button"
					onclick={addShipsTo}
					class="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400"
				>
					+ Add
				</button>
			</div>
			{#each shipsTo as country, index}
				<div class="flex items-center gap-2">
					<input
						type="text"
						bind:value={shipsTo[index]}
						placeholder="US"
						maxlength="2"
						class="block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white font-mono uppercase"
						class:border-red-500={errors.ships_to}
					/>
					{#if shipsTo.length > 1}
						<button
							type="button"
							onclick={() => removeShipsTo(index)}
							class="p-1 text-gray-400 hover:text-red-600"
						>
							<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
							</svg>
						</button>
					{/if}
				</div>
			{/each}
			{#if errors.ships_to}
				<p class="text-sm text-red-600">{errors.ships_to}</p>
			{/if}
		</div>
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