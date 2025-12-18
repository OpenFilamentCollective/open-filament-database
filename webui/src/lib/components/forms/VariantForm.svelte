<script lang="ts">
	import { VariantSchema, type Variant } from '$lib/schemas/generated';
	import { addChange } from '$lib/stores/changes.svelte';

	interface Props {
		initialData?: Variant;
		variantPath: string;
		onSave?: () => void;
		onCancel?: () => void;
	}

	let { initialData, variantPath, onSave, onCancel }: Props = $props();

	// Handle color_hex which can be string or array
	const initialColorHex = initialData?.color_hex
		? Array.isArray(initialData.color_hex)
			? initialData.color_hex.join(', ')
			: initialData.color_hex
		: '';

	let formData = $state({
		color_name: initialData?.color_name ?? '',
		color_hex: initialColorHex,
		discontinued: initialData?.discontinued ?? false,
		translucent: initialData?.traits?.translucent ?? false,
		glow: initialData?.traits?.glow ?? false,
		matte: initialData?.traits?.matte ?? false,
		recycled: initialData?.traits?.recycled ?? false,
		recyclable: initialData?.traits?.recyclable ?? false,
		biodegradable: initialData?.traits?.biodegradable ?? false
	});

	let errors = $state<Record<string, string>>({});
	let isSubmitting = $state(false);

	function buildVariantData(): Partial<Variant> {
		// Parse color_hex - support comma-separated values for multi-color
		const colorInput = formData.color_hex.trim();
		let color_hex: string | string[];
		if (colorInput.includes(',')) {
			color_hex = colorInput.split(',').map((c) => c.trim());
		} else {
			color_hex = colorInput;
		}

		const traits =
			formData.translucent ||
			formData.glow ||
			formData.matte ||
			formData.recycled ||
			formData.recyclable ||
			formData.biodegradable
				? {
						translucent: formData.translucent || null,
						glow: formData.glow || null,
						matte: formData.matte || null,
						recycled: formData.recycled || null,
						recyclable: formData.recyclable || null,
						biodegradable: formData.biodegradable || null
					}
				: null;

		return {
			color_name: formData.color_name,
			color_hex,
			discontinued: formData.discontinued || null,
			traits,
			color_standards: null,
			hex_variants: null
		};
	}

	function validate(): boolean {
		errors = {};
		const data = buildVariantData();
		const result = VariantSchema.safeParse(data);

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

		const data = buildVariantData();
		const operation = initialData ? 'update' : 'create';
		addChange(operation, `${variantPath}/variant.json`, data as Record<string, unknown>);

		isSubmitting = false;
		onSave?.();
	}
</script>

<form onsubmit={handleSubmit} class="space-y-4">
	<div>
		<label for="color_name" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
			Color Name *
		</label>
		<input
			type="text"
			id="color_name"
			bind:value={formData.color_name}
			class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
			class:border-red-500={errors.color_name}
		/>
		{#if errors.color_name}
			<p class="mt-1 text-sm text-red-600">{errors.color_name}</p>
		{/if}
	</div>

	<div>
		<label for="color_hex" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
			Color Hex * (comma-separated for multi-color)
		</label>
		<div class="mt-1 flex gap-2">
			<input
				type="text"
				id="color_hex"
				bind:value={formData.color_hex}
				placeholder="#FF5733 or FF5733, 33FF57"
				class="block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
				class:border-red-500={errors.color_hex}
			/>
			{#if formData.color_hex}
				<div
					class="h-10 w-10 rounded-md border border-gray-300"
					style="background-color: {formData.color_hex.startsWith('#')
						? formData.color_hex.split(',')[0].trim()
						: '#' + formData.color_hex.split(',')[0].trim()}"
				></div>
			{/if}
		</div>
		{#if errors.color_hex}
			<p class="mt-1 text-sm text-red-600">{errors.color_hex}</p>
		{/if}
	</div>

	<div class="space-y-2">
		<span class="block text-sm font-medium text-gray-700 dark:text-gray-300">Traits</span>
		<div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
			<label class="flex items-center gap-2">
				<input
					type="checkbox"
					bind:checked={formData.translucent}
					class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
				/>
				<span class="text-sm text-gray-700 dark:text-gray-300">Translucent</span>
			</label>
			<label class="flex items-center gap-2">
				<input
					type="checkbox"
					bind:checked={formData.glow}
					class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
				/>
				<span class="text-sm text-gray-700 dark:text-gray-300">Glow in Dark</span>
			</label>
			<label class="flex items-center gap-2">
				<input
					type="checkbox"
					bind:checked={formData.matte}
					class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
				/>
				<span class="text-sm text-gray-700 dark:text-gray-300">Matte</span>
			</label>
			<label class="flex items-center gap-2">
				<input
					type="checkbox"
					bind:checked={formData.recycled}
					class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
				/>
				<span class="text-sm text-gray-700 dark:text-gray-300">Recycled</span>
			</label>
			<label class="flex items-center gap-2">
				<input
					type="checkbox"
					bind:checked={formData.recyclable}
					class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
				/>
				<span class="text-sm text-gray-700 dark:text-gray-300">Recyclable</span>
			</label>
			<label class="flex items-center gap-2">
				<input
					type="checkbox"
					bind:checked={formData.biodegradable}
					class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
				/>
				<span class="text-sm text-gray-700 dark:text-gray-300">Biodegradable</span>
			</label>
		</div>
	</div>

	<div class="flex items-center gap-2">
		<input
			type="checkbox"
			id="discontinued"
			bind:checked={formData.discontinued}
			class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
		/>
		<label for="discontinued" class="text-sm font-medium text-gray-700 dark:text-gray-300">
			Discontinued
		</label>
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
