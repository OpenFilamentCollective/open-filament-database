<script lang="ts">
	import { VariantSchema, type Variant, type ColorStandards } from '$lib/schemas/generated';
	import { addChange, getChangeByOriginalPath, removeChange } from '$lib/stores/changes.svelte';

	interface Props {
		initialData?: Variant;
		variantPath: string;
		onSave?: (newColorName: string) => void;
		onCancel?: () => void;
	}

	let { initialData, variantPath, onSave, onCancel }: Props = $props();

	// Deep comparison for variant data (ignoring null vs undefined differences)
	function isDataEqual(a: Partial<Variant>, b: Partial<Variant> | undefined): boolean {
		if (!b) return false;

		// Compare color_name
		if (a.color_name !== b.color_name) return false;

		// Compare color_hex (normalize to array for comparison)
		const aColors = Array.isArray(a.color_hex) ? a.color_hex : a.color_hex ? [a.color_hex] : [];
		const bColors = Array.isArray(b.color_hex) ? b.color_hex : b.color_hex ? [b.color_hex] : [];
		if (aColors.length !== bColors.length) return false;
		if (!aColors.every((c, i) => c === bColors[i])) return false;

		// Compare discontinued (treat null/false/undefined as equal)
		if (Boolean(a.discontinued) !== Boolean(b.discontinued)) return false;

		// Compare traits
		const aTraits = a.traits || {};
		const bTraits = b.traits || {};
		const traitKeys = ['translucent', 'glow', 'matte', 'recycled', 'recyclable', 'biodegradable'] as const;
		for (const key of traitKeys) {
			if (Boolean(aTraits[key]) !== Boolean(bTraits[key])) return false;
		}

		// Compare hex_variants
		const aVariants = a.hex_variants || [];
		const bVariants = b.hex_variants || [];
		if (aVariants.length !== bVariants.length) return false;
		if (!aVariants.every((v, i) => v === bVariants[i])) return false;

		// Compare color_standards
		const aStandards = a.color_standards || {};
		const bStandards = b.color_standards || {};
		const standardKeys = ['ral', 'ncs', 'pantone', 'bs', 'munsell'] as const;
		for (const key of standardKeys) {
			if ((aStandards[key] || '') !== (bStandards[key] || '')) return false;
		}

		return true;
	}

	// Handle color_hex which can be string or array - convert to array for UI
	// Strip # prefix for storage, we'll add it back when saving
	function stripHash(hex: string): string {
		return hex.replace(/^#/, '').slice(0, 6).toUpperCase();
	}

	function parseInitialColors(): string[] {
		if (!initialData?.color_hex) return [''];
		if (Array.isArray(initialData.color_hex)) {
			return initialData.color_hex.length > 0
				? initialData.color_hex.map(stripHash)
				: [''];
		}
		return [stripHash(initialData.color_hex)];
	}

	let colorHexes = $state<string[]>(parseInitialColors());

	// Parse initial hex_variants
	function parseInitialHexVariants(): string[] {
		if (!initialData?.hex_variants || initialData.hex_variants.length === 0) return [];
		return initialData.hex_variants.map(stripHash);
	}

	let hexVariants = $state<string[]>(parseInitialHexVariants());

	// Handle input to strip # and clamp to 6 chars
	function handleColorInput(index: number, event: Event) {
		const input = event.target as HTMLInputElement;
		// Remove # and non-hex characters, clamp to 6
		const cleaned = input.value.replace(/[^0-9A-Fa-f]/g, '').slice(0, 6).toUpperCase();
		colorHexes[index] = cleaned;
	}

	function handleHexVariantInput(index: number, event: Event) {
		const input = event.target as HTMLInputElement;
		const cleaned = input.value.replace(/[^0-9A-Fa-f]/g, '').slice(0, 6).toUpperCase();
		hexVariants[index] = cleaned;
	}

	let formData = $state({
		color_name: initialData?.color_name ?? '',
		discontinued: initialData?.discontinued ?? false,
		translucent: initialData?.traits?.translucent ?? false,
		glow: initialData?.traits?.glow ?? false,
		matte: initialData?.traits?.matte ?? false,
		recycled: initialData?.traits?.recycled ?? false,
		recyclable: initialData?.traits?.recyclable ?? false,
		biodegradable: initialData?.traits?.biodegradable ?? false,
		// Color standards
		ral: initialData?.color_standards?.ral ?? '',
		ncs: initialData?.color_standards?.ncs ?? '',
		pantone: initialData?.color_standards?.pantone ?? '',
		bs: initialData?.color_standards?.bs ?? '',
		munsell: initialData?.color_standards?.munsell ?? ''
	});

	function addColor() {
		colorHexes = [...colorHexes, ''];
	}

	function removeColor(index: number) {
		if (colorHexes.length > 1) {
			colorHexes = colorHexes.filter((_, i) => i !== index);
		}
	}

	function addHexVariant() {
		hexVariants = [...hexVariants, ''];
	}

	function removeHexVariant(index: number) {
		hexVariants = hexVariants.filter((_, i) => i !== index);
	}

	let errors = $state<Record<string, string>>({});
	let isSubmitting = $state(false);

	function buildVariantData(): Partial<Variant> {
		// Filter out empty colors and prepend # for storage
		const validColors = colorHexes
			.map((c) => c.trim())
			.filter((c) => c.length > 0)
			.map((c) => '#' + c);
		// If single color, save as string; if multiple, save as array
		const color_hex: string | string[] = validColors.length === 1 ? validColors[0] : validColors;

		// Build hex_variants array
		const validHexVariants = hexVariants
			.map((c) => c.trim())
			.filter((c) => c.length > 0)
			.map((c) => '#' + c);
		const hex_variants = validHexVariants.length > 0 ? validHexVariants : null;

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

		// Build color_standards
		const hasColorStandards =
			formData.ral || formData.ncs || formData.pantone || formData.bs || formData.munsell;
		const color_standards: ColorStandards | null = hasColorStandards
			? {
					ral: formData.ral || null,
					ncs: formData.ncs || null,
					pantone: formData.pantone || null,
					bs: formData.bs || null,
					munsell: formData.munsell || null
				}
			: null;

		return {
			color_name: formData.color_name,
			color_hex,
			discontinued: formData.discontinued || null,
			traits,
			color_standards,
			hex_variants
		};
	}

	function validate(): boolean {
		errors = {};

		// Check for empty name first
		if (!formData.color_name.trim()) {
			errors.color_name = 'Color name is required';
			document.getElementById('color_name')?.focus();
			return false;
		}

		// Check for empty color hex
		const validColors = colorHexes.filter((c) => c.trim().length > 0);
		if (validColors.length === 0) {
			errors.color_hex = 'At least one color hex is required';
			document.getElementById('color_hex_0')?.focus();
			return false;
		}

		const data = buildVariantData();
		const result = VariantSchema.safeParse(data);

		if (!result.success) {
			for (const issue of result.error.issues) {
				const path = issue.path.join('.');
				errors[path] = issue.message;
			}

			// Focus the first error field
			const firstErrorPath = result.error.issues[0]?.path[0];
			if (firstErrorPath === 'color_name') {
				document.getElementById('color_name')?.focus();
			} else if (firstErrorPath === 'color_hex') {
				document.getElementById('color_hex_0')?.focus();
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
		// For new variants, variantPath is {brand}/{material}/{filament}, so we need to add the color name
		// For existing variants, variantPath already includes the color name
		const path = initialData ? variantPath : `${variantPath}/${formData.color_name}`;
		const changePath = `${path}/variant.json`;

		// Check if data actually changed from initial
		if (isDataEqual(data, initialData)) {
			// Data hasn't changed - remove any existing pending change
			const existingChange = getChangeByOriginalPath(changePath);
			if (existingChange) {
				removeChange(existingChange.id);
			}
		} else {
			// Data has changed - add/update the change
			const operation = initialData ? 'update' : 'create';
			addChange(operation, changePath, data as Record<string, unknown>);
		}

		isSubmitting = false;
		onSave?.(formData.color_name);
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

	<div class="space-y-2">
		<div class="flex items-center justify-between">
			<span class="block text-sm font-medium text-gray-700 dark:text-gray-300">Color Hex *</span>
			<button
				type="button"
				onclick={addColor}
				class="flex items-center gap-1 rounded-md bg-green-100 px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-200 dark:bg-green-900 dark:text-green-200 dark:hover:bg-green-800"
			>
				<svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
				</svg>
				Add Color
			</button>
		</div>
		{#each colorHexes as color, index}
			<div class="flex items-center gap-2">
				<div class="flex flex-1">
					<span class="inline-flex items-center rounded-l-md border border-r-0 border-gray-300 bg-gray-50 px-3 text-sm text-gray-500 dark:border-gray-600 dark:bg-gray-600 dark:text-gray-300">
						#
					</span>
					<input
						type="text"
						id="color_hex_{index}"
						value={colorHexes[index]}
						oninput={(e) => handleColorInput(index, e)}
						placeholder="FF5733"
						maxlength="6"
						class="block w-full rounded-r-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white font-mono uppercase"
						class:border-red-500={errors.color_hex}
					/>
				</div>
				{#if color.trim()}
					<div
						class="h-10 w-10 flex-shrink-0 rounded-md border border-gray-300"
						style="background-color: #{color.trim()}"
					></div>
				{/if}
				{#if colorHexes.length > 1}
					<button
						type="button"
						onclick={() => removeColor(index)}
						class="flex-shrink-0 rounded-md p-2 text-red-600 hover:bg-red-100 dark:hover:bg-red-900"
						title="Remove color"
					>
						<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				{/if}
			</div>
		{/each}
		{#if errors.color_hex}
			<p class="mt-1 text-sm text-red-600">{errors.color_hex}</p>
		{/if}
	</div>

	<div class="space-y-2">
		<div class="flex items-center justify-between">
			<span class="block text-sm font-medium text-gray-700 dark:text-gray-300">
				Hex Variants
				<span class="font-normal text-gray-500">(alternative NFC/RFID colors)</span>
			</span>
			<button
				type="button"
				onclick={addHexVariant}
				class="flex items-center gap-1 rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
			>
				<svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
				</svg>
				Add Variant
			</button>
		</div>
		{#if hexVariants.length > 0}
			{#each hexVariants as variant, index}
				<div class="flex items-center gap-2">
					<div class="flex flex-1">
						<span class="inline-flex items-center rounded-l-md border border-r-0 border-gray-300 bg-gray-50 px-3 text-sm text-gray-500 dark:border-gray-600 dark:bg-gray-600 dark:text-gray-300">
							#
						</span>
						<input
							type="text"
							id="hex_variant_{index}"
							value={hexVariants[index]}
							oninput={(e) => handleHexVariantInput(index, e)}
							placeholder="FF5733"
							maxlength="6"
							class="block w-full rounded-r-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white font-mono uppercase"
						/>
					</div>
					{#if variant.trim()}
						<div
							class="h-10 w-10 flex-shrink-0 rounded-md border border-gray-300"
							style="background-color: #{variant.trim()}"
						></div>
					{/if}
					<button
						type="button"
						onclick={() => removeHexVariant(index)}
						class="flex-shrink-0 rounded-md p-2 text-red-600 hover:bg-red-100 dark:hover:bg-red-900"
						title="Remove variant"
					>
						<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				</div>
			{/each}
		{:else}
			<p class="text-sm text-gray-500 dark:text-gray-400">No hex variants defined</p>
		{/if}
	</div>

	<fieldset class="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
		<legend class="px-2 text-sm font-medium text-gray-700 dark:text-gray-300">
			Color Standards
		</legend>
		<div class="grid grid-cols-2 gap-4 sm:grid-cols-3">
			<div>
				<label for="ral" class="block text-xs font-medium text-gray-700 dark:text-gray-300">
					RAL
				</label>
				<input
					type="text"
					id="ral"
					bind:value={formData.ral}
					placeholder="e.g., 9010"
					class="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
				/>
			</div>
			<div>
				<label for="ncs" class="block text-xs font-medium text-gray-700 dark:text-gray-300">
					NCS
				</label>
				<input
					type="text"
					id="ncs"
					bind:value={formData.ncs}
					placeholder="e.g., S 0500-N"
					class="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
				/>
			</div>
			<div>
				<label for="pantone" class="block text-xs font-medium text-gray-700 dark:text-gray-300">
					Pantone
				</label>
				<input
					type="text"
					id="pantone"
					bind:value={formData.pantone}
					placeholder="e.g., 7527 C"
					class="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
				/>
			</div>
			<div>
				<label for="bs" class="block text-xs font-medium text-gray-700 dark:text-gray-300">
					BS
				</label>
				<input
					type="text"
					id="bs"
					bind:value={formData.bs}
					placeholder="e.g., 381C-100"
					class="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
				/>
			</div>
			<div>
				<label for="munsell" class="block text-xs font-medium text-gray-700 dark:text-gray-300">
					Munsell
				</label>
				<input
					type="text"
					id="munsell"
					bind:value={formData.munsell}
					placeholder="e.g., 5R 4/14"
					class="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
				/>
			</div>
		</div>
	</fieldset>

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
