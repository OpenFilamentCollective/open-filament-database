<script lang="ts">
	import { onMount } from 'svelte';
	import {
		validateImage,
		resizeImage,
		cropImage as cropImageUtil,
		fileToDataUrl,
		type ImageValidationResult,
		type ProcessedImage
	} from '$lib/utils/imageProcessing';

	interface Props {
		currentLogo?: string;
		entityType: 'store' | 'brand';
		entityId: string;
		onLogoChange: (dataUrl: string) => void;
		label?: string;
	}

	let { currentLogo = '', entityType, entityId, onLogoChange, label = 'Logo' }: Props = $props();

	let fileInput: HTMLInputElement;
	let previewUrl: string = $state('');
	let originalImageUrl: string = $state('');
	let showCropModal: boolean = $state(false);
	let validation: ImageValidationResult | null = $state(null);
	let processing: boolean = $state(false);
	let error: string | null = $state(null);

	// Crop state
	let cropCanvas: HTMLCanvasElement | undefined = $state(undefined);
	let cropCtx: CanvasRenderingContext2D | null = null;
	let cropImage: HTMLImageElement | null = null;
	let cropX: number = $state(0);
	let cropY: number = $state(0);
	let cropSize: number = $state(0);
	let isDragging: boolean = $state(false);
	let isResizing: boolean = $state(false);
	let resizeCorner: 'tl' | 'tr' | 'bl' | 'br' | null = $state(null);
	let dragStartX: number = 0;
	let dragStartY: number = 0;
	let resizeStartX: number = 0;
	let resizeStartY: number = 0;
	let resizeStartSize: number = 0;

	$effect(() => {
		// Update preview when currentLogo prop changes - construct API URL
		if (currentLogo) {
			previewUrl = `/api/${entityType}s/${entityId}/logo/${currentLogo}`;
		} else {
			previewUrl = '';
		}
	});

	async function handleFileSelect(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];

		if (!file) return;

		error = null;
		processing = true;

		try {
			// Validate the image
			validation = await validateImage(file);

			if (!validation.valid) {
				error = validation.error || 'Invalid image';
				processing = false;
				return;
			}

			// Convert to data URL
			const dataUrl = await fileToDataUrl(file);
			originalImageUrl = dataUrl;

			// If square and in range, process immediately
			if (validation.isSquare && !validation.needsResize) {
				previewUrl = dataUrl;
				onLogoChange(dataUrl);
				processing = false;
				return;
			}

			// If square but needs resizing
			if (validation.isSquare && validation.needsResize) {
				const processed = await resizeImage(dataUrl);
				previewUrl = processed.dataUrl;
				onLogoChange(processed.dataUrl);
				processing = false;
				return;
			}

			// If not square, show crop modal
			if (validation.needsCrop) {
				showCropModal = true;
				processing = false;
				// Initialize crop area
				setTimeout(() => initializeCrop(), 100);
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to process image';
			processing = false;
		}
	}

	function initializeCrop() {
		if (!originalImageUrl || !validation) return;

		const img = new Image();
		img.onload = () => {
			cropImage = img;
			const minDimension = Math.min(validation!.width, validation!.height);
			cropSize = Math.round(minDimension);
			cropX = Math.round((validation!.width - minDimension) / 2);
			cropY = Math.round((validation!.height - minDimension) / 2);

			drawCropPreview();
		};
		img.src = originalImageUrl;
	}

	function drawCropPreview() {
		if (!cropCanvas || !cropImage) return;

		const ctx = cropCanvas.getContext('2d');
		if (!ctx) return;

		cropCtx = ctx;

		// Clear canvas
		ctx.clearRect(0, 0, cropCanvas.width, cropCanvas.height);

		// Draw the full image
		ctx.drawImage(cropImage, 0, 0, cropCanvas.width, cropCanvas.height);

		// Draw dimmed overlay
		ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
		ctx.fillRect(0, 0, cropCanvas.width, cropCanvas.height);

		// Calculate scale factor
		const scaleX = cropCanvas.width / cropImage.width;
		const scaleY = cropCanvas.height / cropImage.height;

		const canvasCropX = cropX * scaleX;
		const canvasCropY = cropY * scaleY;
		const canvasCropSize = cropSize * scaleX;

		// Clear the crop area (show original image)
		ctx.clearRect(canvasCropX, canvasCropY, canvasCropSize, canvasCropSize);

		// Redraw image in crop area only
		ctx.save();
		ctx.beginPath();
		ctx.rect(canvasCropX, canvasCropY, canvasCropSize, canvasCropSize);
		ctx.clip();
		ctx.drawImage(cropImage, 0, 0, cropCanvas.width, cropCanvas.height);
		ctx.restore();

		// Draw crop border
		ctx.strokeStyle = '#3b82f6';
		ctx.lineWidth = 2;
		ctx.strokeRect(canvasCropX, canvasCropY, canvasCropSize, canvasCropSize);

		// Draw corner handles
		const handleSize = 10;
		ctx.fillStyle = '#3b82f6';

		// Top-left
		ctx.fillRect(canvasCropX - handleSize / 2, canvasCropY - handleSize / 2, handleSize, handleSize);
		// Top-right
		ctx.fillRect(
			canvasCropX + canvasCropSize - handleSize / 2,
			canvasCropY - handleSize / 2,
			handleSize,
			handleSize
		);
		// Bottom-left
		ctx.fillRect(
			canvasCropX - handleSize / 2,
			canvasCropY + canvasCropSize - handleSize / 2,
			handleSize,
			handleSize
		);
		// Bottom-right
		ctx.fillRect(
			canvasCropX + canvasCropSize - handleSize / 2,
			canvasCropY + canvasCropSize - handleSize / 2,
			handleSize,
			handleSize
		);
	}

	function handleMouseDown(event: MouseEvent) {
		if (!cropCanvas || !cropImage) return;

		const rect = cropCanvas.getBoundingClientRect();
		const scaleX = cropImage.width / cropCanvas.width;
		const scaleY = cropImage.height / cropCanvas.height;

		const mouseX = (event.clientX - rect.left) * scaleX;
		const mouseY = (event.clientY - rect.top) * scaleY;

		// Check for corner handle clicks (with tolerance)
		const handleTolerance = 15;

		// Top-left
		if (
			Math.abs(mouseX - cropX) < handleTolerance &&
			Math.abs(mouseY - cropY) < handleTolerance
		) {
			isResizing = true;
			resizeCorner = 'tl';
			resizeStartX = cropX;
			resizeStartY = cropY;
			resizeStartSize = cropSize;
			return;
		}

		// Top-right
		if (
			Math.abs(mouseX - (cropX + cropSize)) < handleTolerance &&
			Math.abs(mouseY - cropY) < handleTolerance
		) {
			isResizing = true;
			resizeCorner = 'tr';
			resizeStartX = cropX;
			resizeStartY = cropY;
			resizeStartSize = cropSize;
			return;
		}

		// Bottom-left
		if (
			Math.abs(mouseX - cropX) < handleTolerance &&
			Math.abs(mouseY - (cropY + cropSize)) < handleTolerance
		) {
			isResizing = true;
			resizeCorner = 'bl';
			resizeStartX = cropX;
			resizeStartY = cropY;
			resizeStartSize = cropSize;
			return;
		}

		// Bottom-right
		if (
			Math.abs(mouseX - (cropX + cropSize)) < handleTolerance &&
			Math.abs(mouseY - (cropY + cropSize)) < handleTolerance
		) {
			isResizing = true;
			resizeCorner = 'br';
			resizeStartX = cropX;
			resizeStartY = cropY;
			resizeStartSize = cropSize;
			return;
		}

		// Check if click is inside crop area (for dragging)
		if (
			mouseX >= cropX &&
			mouseX <= cropX + cropSize &&
			mouseY >= cropY &&
			mouseY <= cropY + cropSize
		) {
			isDragging = true;
			dragStartX = mouseX - cropX;
			dragStartY = mouseY - cropY;
		}
	}

	function handleMouseMove(event: MouseEvent) {
		if ((!isDragging && !isResizing) || !cropCanvas || !cropImage) return;

		const rect = cropCanvas.getBoundingClientRect();
		const scaleX = cropImage.width / cropCanvas.width;
		const scaleY = cropImage.height / cropCanvas.height;

		const mouseX = (event.clientX - rect.left) * scaleX;
		const mouseY = (event.clientY - rect.top) * scaleY;

		if (isResizing && resizeCorner) {
			// Handle resizing from corners
			let newX = cropX;
			let newY = cropY;
			let newSize = cropSize;

			if (resizeCorner === 'tl') {
				// Top-left: adjust both position and size
				const deltaX = mouseX - resizeStartX;
				const deltaY = mouseY - resizeStartY;
				const delta = Math.max(deltaX, deltaY); // Use max to maintain square

				newX = resizeStartX + delta;
				newY = resizeStartY + delta;
				newSize = resizeStartSize - delta;
			} else if (resizeCorner === 'tr') {
				// Top-right: adjust Y and size
				const deltaX = mouseX - (resizeStartX + resizeStartSize);
				const deltaY = mouseY - resizeStartY;
				const delta = Math.max(deltaX, -deltaY); // Use max to maintain square

				newY = resizeStartY - delta;
				newSize = resizeStartSize + delta;
			} else if (resizeCorner === 'bl') {
				// Bottom-left: adjust X and size
				const deltaX = mouseX - resizeStartX;
				const deltaY = mouseY - (resizeStartY + resizeStartSize);
				const delta = Math.max(-deltaX, deltaY); // Use max to maintain square

				newX = resizeStartX - delta;
				newSize = resizeStartSize + delta;
			} else if (resizeCorner === 'br') {
				// Bottom-right: only adjust size
				const deltaX = mouseX - (resizeStartX + resizeStartSize);
				const deltaY = mouseY - (resizeStartY + resizeStartSize);
				const delta = Math.max(deltaX, deltaY); // Use max to maintain square

				newSize = resizeStartSize + delta;
			}

			// Snap to pixel
			newX = Math.round(newX);
			newY = Math.round(newY);
			newSize = Math.round(newSize);

			// Constrain minimum size
			const minSize = 50;
			if (newSize < minSize) {
				return;
			}

			// Constrain to image bounds
			if (newX < 0 || newY < 0 || newX + newSize > cropImage.width || newY + newSize > cropImage.height) {
				return;
			}

			cropX = newX;
			cropY = newY;
			cropSize = newSize;
		} else if (isDragging) {
			// Handle dragging
			let newX = mouseX - dragStartX;
			let newY = mouseY - dragStartY;

			// Constrain to image bounds
			newX = Math.max(0, Math.min(newX, cropImage.width - cropSize));
			newY = Math.max(0, Math.min(newY, cropImage.height - cropSize));

			// Snap to pixel
			newX = Math.round(newX);
			newY = Math.round(newY);

			cropX = newX;
			cropY = newY;
		}

		drawCropPreview();
	}

	function handleMouseUp() {
		isDragging = false;
		isResizing = false;
		resizeCorner = null;
	}

	function getCursorStyle(event: MouseEvent): string {
		if (!cropCanvas || !cropImage || isDragging || isResizing) return 'default';

		const rect = cropCanvas.getBoundingClientRect();
		const scaleX = cropImage.width / cropCanvas.width;
		const scaleY = cropImage.height / cropCanvas.height;

		const mouseX = (event.clientX - rect.left) * scaleX;
		const mouseY = (event.clientY - rect.top) * scaleY;

		const handleTolerance = 15;

		// Check corner positions for cursor feedback
		if (
			Math.abs(mouseX - cropX) < handleTolerance &&
			Math.abs(mouseY - cropY) < handleTolerance
		) {
			return 'nwse-resize';
		}

		if (
			Math.abs(mouseX - (cropX + cropSize)) < handleTolerance &&
			Math.abs(mouseY - cropY) < handleTolerance
		) {
			return 'nesw-resize';
		}

		if (
			Math.abs(mouseX - cropX) < handleTolerance &&
			Math.abs(mouseY - (cropY + cropSize)) < handleTolerance
		) {
			return 'nesw-resize';
		}

		if (
			Math.abs(mouseX - (cropX + cropSize)) < handleTolerance &&
			Math.abs(mouseY - (cropY + cropSize)) < handleTolerance
		) {
			return 'nwse-resize';
		}

		if (
			mouseX >= cropX &&
			mouseX <= cropX + cropSize &&
			mouseY >= cropY &&
			mouseY <= cropY + cropSize
		) {
			return 'move';
		}

		return 'default';
	}

	function updateCursor(event: MouseEvent) {
		if (cropCanvas) {
			cropCanvas.style.cursor = getCursorStyle(event);
		}
	}

	async function applyCrop() {
		if (!originalImageUrl) return;

		processing = true;
		error = null;

		try {
			const processed = await cropImageUtil(originalImageUrl, cropX, cropY, cropSize);
			previewUrl = processed.dataUrl;
			onLogoChange(processed.dataUrl);
			showCropModal = false;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to crop image';
		} finally {
			processing = false;
		}
	}

	function cancelCrop() {
		showCropModal = false;
		originalImageUrl = '';
		validation = null;
		if (fileInput) {
			fileInput.value = '';
		}
	}

	function triggerFileSelect() {
		fileInput?.click();
	}
</script>

<div class="logo-upload">
	<div class="font-bold">
		{label}
	</div>

	<div class="flex items-start gap-4">
		{#if previewUrl}
			<div class="flex-shrink-0">
				<img
					src={previewUrl}
					alt="Logo preview"
					class="w-24 h-24 object-cover border border-gray-300 rounded"
				/>
			</div>
		{/if}

		<div class="flex-1">
			<input
				type="file"
				accept="image/*"
				bind:this={fileInput}
				onchange={handleFileSelect}
				class="hidden"
			/>

			<button
				type="button"
				onclick={triggerFileSelect}
				disabled={processing}
				class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
			>
				{processing ? 'Processing...' : previewUrl ? 'Change Logo' : 'Upload Logo'}
			</button>

			<p class="text-xs text-gray-500 mt-2">
				Image must be square, between 100x100 and 400x400 pixels. Non-square images will be cropped.
			</p>

			{#if error}
				<p class="text-sm text-red-600 mt-2">{error}</p>
			{/if}
		</div>
	</div>
</div>

{#if showCropModal}
	<div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
		<div class="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-auto">
			<div class="p-6">
				<h3 class="text-xl font-semibold mb-4">Crop Image</h3>

				<p class="text-sm text-gray-600 mb-4">
					Drag the crop area to move it. Use the corner handles to resize. The crop area must be square.
				</p>

				{#if validation}
					<div class="mb-4 bg-gray-50 p-4 rounded flex items-center justify-center">
						<canvas
							bind:this={cropCanvas}
							width={600}
							height={600 * (validation.height / validation.width)}
							class="max-w-full border border-gray-300"
							onmousedown={handleMouseDown}
							onmousemove={(e) => {
								handleMouseMove(e);
								updateCursor(e);
							}}
							onmouseup={handleMouseUp}
							onmouseleave={handleMouseUp}
						></canvas>
					</div>
				{/if}

				<div class="flex justify-end gap-2">
					<button
						type="button"
						onclick={cancelCrop}
						disabled={processing}
						class="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 transition-colors disabled:opacity-50"
					>
						Cancel
					</button>
					<button
						type="button"
						onclick={applyCrop}
						disabled={processing}
						class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:opacity-50"
					>
						{processing ? 'Processing...' : 'Apply Crop'}
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.logo-upload {
		margin-bottom: 1rem;
	}
</style>
