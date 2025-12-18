<script lang="ts">
	interface Props {
		value: string;
		onChange: (value: string) => void;
		error?: string;
	}

	let { value, onChange, error }: Props = $props();

	let isDragging = $state(false);
	let validationError = $state<string | null>(null);
	let previewUrl = $state<string | null>(null);

	// Detect content type
	let isBase64 = $derived(value.startsWith('data:'));
	let isRawSvg = $derived(value.startsWith('<svg') || value.startsWith('<?xml'));
	let isEmbedded = $derived(isBase64 || isRawSvg);
	let isSvg = $derived(value.endsWith('.svg') || value.startsWith('data:image/svg') || isRawSvg);

	// Set preview URL based on value type
	$effect(() => {
		if (isBase64) {
			previewUrl = value;
		} else if (isRawSvg) {
			// Convert raw SVG to data URL for preview
			previewUrl = `data:image/svg+xml;base64,${btoa(value)}`;
		} else if (value) {
			// Assume it's a filename - no preview available for existing files
			previewUrl = null;
		} else {
			previewUrl = null;
		}
	});

	async function validateAndProcessFile(file: File): Promise<string | null> {
		validationError = null;

		const fileName = file.name.toLowerCase();
		const isSvgFile = fileName.endsWith('.svg') || file.type === 'image/svg+xml';
		const isImageFile = ['image/webp', 'image/png', 'image/jpeg'].includes(file.type);

		if (!isSvgFile && !isImageFile) {
			validationError = 'Please upload an SVG, WebP, PNG, or JPG file';
			return null;
		}

		if (isSvgFile) {
			// Validate SVG
			try {
				const text = await file.text();
				const parser = new DOMParser();
				const doc = parser.parseFromString(text, 'image/svg+xml');
				const errorNode = doc.querySelector('parsererror');
				if (errorNode) {
					validationError = 'Invalid SVG file';
					return null;
				}
				// Return raw SVG content (not base64 encoded)
				return text;
			} catch {
				validationError = 'Failed to parse SVG file';
				return null;
			}
		}

		// Validate image dimensions
		return new Promise((resolve) => {
			const img = new Image();
			const objectUrl = URL.createObjectURL(file);

			img.onload = async () => {
				URL.revokeObjectURL(objectUrl);

				if (img.width < 100 || img.height < 100) {
					validationError = `Image must be at least 100x100 pixels (got ${img.width}x${img.height})`;
					resolve(null);
					return;
				}

				if (img.width > 500 || img.height > 500) {
					validationError = `Image must be at most 500x500 pixels (got ${img.width}x${img.height})`;
					resolve(null);
					return;
				}

				// Convert to base64
				try {
					const reader = new FileReader();
					reader.onload = () => {
						resolve(reader.result as string);
					};
					reader.onerror = () => {
						validationError = 'Failed to read image file';
						resolve(null);
					};
					reader.readAsDataURL(file);
				} catch {
					validationError = 'Failed to process image file';
					resolve(null);
				}
			};

			img.onerror = () => {
				URL.revokeObjectURL(objectUrl);
				validationError = 'Failed to load image';
				resolve(null);
			};

			img.src = objectUrl;
		});
	}

	async function handleFileSelect(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		const result = await validateAndProcessFile(file);
		if (result) {
			onChange(result);
		}
		// Reset input so same file can be selected again
		input.value = '';
	}

	async function handleDrop(event: DragEvent) {
		event.preventDefault();
		isDragging = false;

		const file = event.dataTransfer?.files[0];
		if (!file) return;

		const result = await validateAndProcessFile(file);
		if (result) {
			onChange(result);
		}
	}

	function handleDragOver(event: DragEvent) {
		event.preventDefault();
		isDragging = true;
	}

	function handleDragLeave() {
		isDragging = false;
	}

	function handleClear() {
		onChange('');
		validationError = null;
	}
</script>

<div class="space-y-2">
	<label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
		Logo *
	</label>

	<div
		class="relative rounded-lg border-2 border-dashed p-4 transition-colors"
		class:border-blue-400={isDragging}
		class:bg-blue-50={isDragging}
		class:dark:bg-blue-900={isDragging}
		class:border-gray-300={!isDragging && !error && !validationError}
		class:dark:border-gray-600={!isDragging && !error && !validationError}
		class:border-red-500={error || validationError}
		ondrop={handleDrop}
		ondragover={handleDragOver}
		ondragleave={handleDragLeave}
		role="button"
		tabindex="0"
	>
		{#if previewUrl || value}
			<div class="flex items-center gap-4">
				{#if previewUrl}
					<img
						src={previewUrl}
						alt="Logo preview"
						class="h-16 w-16 rounded-lg object-contain border border-gray-200 dark:border-gray-600"
					/>
				{:else}
					<div class="flex h-16 w-16 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-700">
						<svg class="h-8 w-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
						</svg>
					</div>
				{/if}
				<div class="flex-1">
					<p class="text-sm font-medium text-gray-900 dark:text-white">
						{#if isEmbedded}
							{isSvg ? 'SVG Image' : 'Uploaded Image'}
						{:else}
							{value}
						{/if}
					</p>
					<p class="text-xs text-gray-500 dark:text-gray-400">
						{#if isEmbedded}
							Ready to save
						{:else}
							Existing file
						{/if}
					</p>
				</div>
				<button
					type="button"
					onclick={handleClear}
					class="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700"
					title="Remove logo"
				>
					<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>
		{:else}
			<div class="text-center">
				<svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
				</svg>
				<p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
					Drag and drop a logo, or
					<label class="cursor-pointer text-blue-600 hover:text-blue-500 dark:text-blue-400">
						browse
						<input
							type="file"
							accept=".svg,.webp,.png,.jpg,.jpeg,image/svg+xml,image/webp,image/png,image/jpeg"
							class="hidden"
							onchange={handleFileSelect}
						/>
					</label>
				</p>
				<p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
					SVG, WebP, PNG, or JPG (100x100 to 500x500 pixels)
				</p>
			</div>
		{/if}
	</div>

	{#if validationError}
		<p class="text-sm text-red-600">{validationError}</p>
	{/if}
	{#if error}
		<p class="text-sm text-red-600">{error}</p>
	{/if}
</div>
