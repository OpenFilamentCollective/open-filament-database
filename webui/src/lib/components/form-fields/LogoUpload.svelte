<script lang="ts">
	import { useChangeTracking, isCloudMode, apiBaseUrl } from '$lib/stores/environment';
	import { changeStore } from '$lib/stores/changes';
	import { Button } from '$lib/components/ui';
	import {
		validateImage,
		resizeImage,
		cropImage as cropImageUtil,
		fileToDataUrl,
		processSvg,
		isSvgDataUrl,
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
	let resizeHandle: 'tl' | 'tr' | 'bl' | 'br' | 't' | 'r' | 'b' | 'l' | null = $state(null);
	let dragStartX: number = 0;
	let dragStartY: number = 0;
	let resizeStartX: number = 0;
	let resizeStartY: number = 0;
	let resizeStartSize: number = 0;

	// Canvas dimensions (constrained to viewport)
	let canvasWidth: number = $state(400);
	let canvasHeight: number = $state(400);
	let needsRedraw: boolean = $state(false);

	// Redraw when canvas becomes available or dimensions change
	$effect(() => {
		// Track these reactive values
		const canvas = cropCanvas;
		const image = cropImage;
		const width = canvasWidth;
		const height = canvasHeight;
		const redraw = needsRedraw;

		if (redraw && canvas && image && width > 0 && height > 0) {
			// Use multiple frames to ensure canvas has been resized by browser
			requestAnimationFrame(() => {
				requestAnimationFrame(() => {
					drawCropPreview();
				});
			});
			needsRedraw = false;
		}
	});

	$effect(() => {
		// Update preview when currentLogo prop changes - construct API URL or use base64
		if (currentLogo) {
			// Check if currentLogo is already a data URL (base64)
			if (currentLogo.startsWith('data:')) {
				previewUrl = currentLogo;
			} else {
				// Check localStorage for staged image changes (both modes)
				if ($useChangeTracking) {
					const imageData = changeStore.getImage(currentLogo);
					if (imageData) {
						const imageRef = $changeStore.images[currentLogo];
						if (imageRef) {
							previewUrl = `data:${imageRef.mimeType};base64,${imageData}`;
							return;
						}
					}
				}

				// URL format depends on the data source, not change tracking
				if ($isCloudMode) {
					previewUrl = `${$apiBaseUrl}/api/${entityType}s/logo/${currentLogo}`;
				} else {
					previewUrl = `/api/${entityType}s/${entityId}/logo/${currentLogo}`;
				}
			}
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
			// Convert to data URL first
			const dataUrl = await fileToDataUrl(file);
			originalImageUrl = dataUrl;

			// Special handling for SVG files
			if (file.type === 'image/svg+xml' || isSvgDataUrl(dataUrl)) {
				const processed = await processSvg(dataUrl);
				previewUrl = processed.dataUrl;
				onLogoChange(processed.dataUrl);
				processing = false;
				return;
			}

			// Validate the image (for raster images)
			validation = await validateImage(file);

			if (!validation.valid) {
				error = validation.error || 'Invalid image';
				processing = false;
				return;
			}

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

			// Calculate canvas size constrained to viewport
			// Use 3/4 of viewport with padding for modal chrome
			const maxWidth = Math.min(window.innerWidth * 0.75 - 48, 700);
			const maxHeight = Math.min(window.innerHeight * 0.7 - 120, 600);

			const aspectRatio = validation!.width / validation!.height;

			if (aspectRatio > 1) {
				// Wider than tall
				canvasWidth = Math.min(maxWidth, validation!.width);
				canvasHeight = canvasWidth / aspectRatio;
				if (canvasHeight > maxHeight) {
					canvasHeight = maxHeight;
					canvasWidth = canvasHeight * aspectRatio;
				}
			} else {
				// Taller than wide
				canvasHeight = Math.min(maxHeight, validation!.height);
				canvasWidth = canvasHeight * aspectRatio;
				if (canvasWidth > maxWidth) {
					canvasWidth = maxWidth;
					canvasHeight = canvasWidth / aspectRatio;
				}
			}

			// Signal that canvas needs redraw (effect will handle timing)
			needsRedraw = true;
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

		// Draw crop border with primary color
		ctx.strokeStyle = 'hsl(var(--primary))';
		ctx.lineWidth = 2;
		ctx.strokeRect(canvasCropX, canvasCropY, canvasCropSize, canvasCropSize);

		// Handle styling - larger, rounded, with border
		const cornerSize = 14;
		const sideSize = 10;
		const sideLength = 24;

		// Helper to draw rounded rect handle
		function drawHandle(x: number, y: number, w: number, h: number) {
			if (!ctx) return;
			const radius = 3;
			ctx.beginPath();
			ctx.roundRect(x, y, w, h, radius);
			ctx.fillStyle = 'hsl(var(--primary))';
			ctx.fill();
			ctx.strokeStyle = 'hsl(var(--primary-foreground))';
			ctx.lineWidth = 1.5;
			ctx.stroke();
		}

		// Corner handles (squares)
		// Top-left
		drawHandle(canvasCropX - cornerSize / 2, canvasCropY - cornerSize / 2, cornerSize, cornerSize);
		// Top-right
		drawHandle(canvasCropX + canvasCropSize - cornerSize / 2, canvasCropY - cornerSize / 2, cornerSize, cornerSize);
		// Bottom-left
		drawHandle(canvasCropX - cornerSize / 2, canvasCropY + canvasCropSize - cornerSize / 2, cornerSize, cornerSize);
		// Bottom-right
		drawHandle(canvasCropX + canvasCropSize - cornerSize / 2, canvasCropY + canvasCropSize - cornerSize / 2, cornerSize, cornerSize);

		// Side handles (pill shapes on edges)
		// Top center
		drawHandle(canvasCropX + canvasCropSize / 2 - sideLength / 2, canvasCropY - sideSize / 2, sideLength, sideSize);
		// Bottom center
		drawHandle(canvasCropX + canvasCropSize / 2 - sideLength / 2, canvasCropY + canvasCropSize - sideSize / 2, sideLength, sideSize);
		// Left center
		drawHandle(canvasCropX - sideSize / 2, canvasCropY + canvasCropSize / 2 - sideLength / 2, sideSize, sideLength);
		// Right center
		drawHandle(canvasCropX + canvasCropSize - sideSize / 2, canvasCropY + canvasCropSize / 2 - sideLength / 2, sideSize, sideLength);
	}

	function handleMouseDown(event: MouseEvent) {
		if (!cropCanvas || !cropImage) return;

		const rect = cropCanvas.getBoundingClientRect();
		const scaleX = cropImage.width / cropCanvas.width;
		const scaleY = cropImage.height / cropCanvas.height;

		const mouseX = (event.clientX - rect.left) * scaleX;
		const mouseY = (event.clientY - rect.top) * scaleY;

		// Handle tolerance for hit detection
		const cornerTolerance = 18;
		const sideTolerance = 16;

		// Helper to check if mouse is near a point
		function nearPoint(mx: number, my: number, px: number, py: number, tol: number) {
			return Math.abs(mx - px) < tol && Math.abs(my - py) < tol;
		}

		// Helper to check if mouse is near a side handle
		function nearSideH(mx: number, my: number, cx: number, cy: number, tolX: number, tolY: number) {
			return Math.abs(mx - cx) < tolX && Math.abs(my - cy) < tolY;
		}

		// Corner handles
		// Top-left
		if (nearPoint(mouseX, mouseY, cropX, cropY, cornerTolerance)) {
			isResizing = true;
			resizeHandle = 'tl';
			resizeStartX = cropX;
			resizeStartY = cropY;
			resizeStartSize = cropSize;
			return;
		}

		// Top-right
		if (nearPoint(mouseX, mouseY, cropX + cropSize, cropY, cornerTolerance)) {
			isResizing = true;
			resizeHandle = 'tr';
			resizeStartX = cropX;
			resizeStartY = cropY;
			resizeStartSize = cropSize;
			return;
		}

		// Bottom-left
		if (nearPoint(mouseX, mouseY, cropX, cropY + cropSize, cornerTolerance)) {
			isResizing = true;
			resizeHandle = 'bl';
			resizeStartX = cropX;
			resizeStartY = cropY;
			resizeStartSize = cropSize;
			return;
		}

		// Bottom-right
		if (nearPoint(mouseX, mouseY, cropX + cropSize, cropY + cropSize, cornerTolerance)) {
			isResizing = true;
			resizeHandle = 'br';
			resizeStartX = cropX;
			resizeStartY = cropY;
			resizeStartSize = cropSize;
			return;
		}

		// Side handles (for maintaining square, resize from center of each side)
		// Top center
		if (nearSideH(mouseX, mouseY, cropX + cropSize / 2, cropY, cropSize / 3, sideTolerance)) {
			isResizing = true;
			resizeHandle = 't';
			resizeStartX = cropX;
			resizeStartY = cropY;
			resizeStartSize = cropSize;
			return;
		}

		// Bottom center
		if (nearSideH(mouseX, mouseY, cropX + cropSize / 2, cropY + cropSize, cropSize / 3, sideTolerance)) {
			isResizing = true;
			resizeHandle = 'b';
			resizeStartX = cropX;
			resizeStartY = cropY;
			resizeStartSize = cropSize;
			return;
		}

		// Left center
		if (nearSideH(mouseX, mouseY, cropX, cropY + cropSize / 2, sideTolerance, cropSize / 3)) {
			isResizing = true;
			resizeHandle = 'l';
			resizeStartX = cropX;
			resizeStartY = cropY;
			resizeStartSize = cropSize;
			return;
		}

		// Right center
		if (nearSideH(mouseX, mouseY, cropX + cropSize, cropY + cropSize / 2, sideTolerance, cropSize / 3)) {
			isResizing = true;
			resizeHandle = 'r';
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

		if (isResizing && resizeHandle) {
			// Handle resizing from corners and sides
			let newX = cropX;
			let newY = cropY;
			let newSize = cropSize;

			const minSize = 50;

			if (resizeHandle === 'tl') {
				// Top-left: adjust both position and size
				const deltaX = mouseX - resizeStartX;
				const deltaY = mouseY - resizeStartY;
				const delta = Math.max(deltaX, deltaY);

				newX = resizeStartX + delta;
				newY = resizeStartY + delta;
				newSize = resizeStartSize - delta;
			} else if (resizeHandle === 'tr') {
				// Top-right: adjust Y and size
				const deltaX = mouseX - (resizeStartX + resizeStartSize);
				const deltaY = mouseY - resizeStartY;
				const delta = Math.max(deltaX, -deltaY);

				newY = resizeStartY - delta;
				newSize = resizeStartSize + delta;
			} else if (resizeHandle === 'bl') {
				// Bottom-left: adjust X and size
				const deltaX = mouseX - resizeStartX;
				const deltaY = mouseY - (resizeStartY + resizeStartSize);
				const delta = Math.max(-deltaX, deltaY);

				newX = resizeStartX - delta;
				newSize = resizeStartSize + delta;
			} else if (resizeHandle === 'br') {
				// Bottom-right: only adjust size
				const deltaX = mouseX - (resizeStartX + resizeStartSize);
				const deltaY = mouseY - (resizeStartY + resizeStartSize);
				const delta = Math.max(deltaX, deltaY);

				newSize = resizeStartSize + delta;
			} else if (resizeHandle === 't') {
				// Top edge: resize from top, maintain center horizontally
				const delta = resizeStartY - mouseY;
				newSize = resizeStartSize + delta * 2;
				newX = resizeStartX + resizeStartSize / 2 - newSize / 2;
				newY = resizeStartY - delta;
			} else if (resizeHandle === 'b') {
				// Bottom edge: resize from bottom, maintain center horizontally
				const delta = mouseY - (resizeStartY + resizeStartSize);
				newSize = resizeStartSize + delta * 2;
				newX = resizeStartX + resizeStartSize / 2 - newSize / 2;
			} else if (resizeHandle === 'l') {
				// Left edge: resize from left, maintain center vertically
				const delta = resizeStartX - mouseX;
				newSize = resizeStartSize + delta * 2;
				newX = resizeStartX - delta;
				newY = resizeStartY + resizeStartSize / 2 - newSize / 2;
			} else if (resizeHandle === 'r') {
				// Right edge: resize from right, maintain center vertically
				const delta = mouseX - (resizeStartX + resizeStartSize);
				newSize = resizeStartSize + delta * 2;
				newY = resizeStartY + resizeStartSize / 2 - newSize / 2;
			}

			// Snap to pixel
			newX = Math.round(newX);
			newY = Math.round(newY);
			newSize = Math.round(newSize);

			// Constrain minimum size
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
		resizeHandle = null;
	}

	function getCursorStyle(event: MouseEvent): string {
		if (!cropCanvas || !cropImage || isDragging || isResizing) return 'default';

		const rect = cropCanvas.getBoundingClientRect();
		const scaleX = cropImage.width / cropCanvas.width;
		const scaleY = cropImage.height / cropCanvas.height;

		const mouseX = (event.clientX - rect.left) * scaleX;
		const mouseY = (event.clientY - rect.top) * scaleY;

		const cornerTolerance = 18;
		const sideTolerance = 16;

		// Helper functions
		function nearPoint(mx: number, my: number, px: number, py: number, tol: number) {
			return Math.abs(mx - px) < tol && Math.abs(my - py) < tol;
		}

		function nearSideH(mx: number, my: number, cx: number, cy: number, tolX: number, tolY: number) {
			return Math.abs(mx - cx) < tolX && Math.abs(my - cy) < tolY;
		}

		// Corner handles
		if (nearPoint(mouseX, mouseY, cropX, cropY, cornerTolerance)) {
			return 'nwse-resize';
		}
		if (nearPoint(mouseX, mouseY, cropX + cropSize, cropY, cornerTolerance)) {
			return 'nesw-resize';
		}
		if (nearPoint(mouseX, mouseY, cropX, cropY + cropSize, cornerTolerance)) {
			return 'nesw-resize';
		}
		if (nearPoint(mouseX, mouseY, cropX + cropSize, cropY + cropSize, cornerTolerance)) {
			return 'nwse-resize';
		}

		// Side handles
		if (nearSideH(mouseX, mouseY, cropX + cropSize / 2, cropY, cropSize / 3, sideTolerance)) {
			return 'ns-resize';
		}
		if (nearSideH(mouseX, mouseY, cropX + cropSize / 2, cropY + cropSize, cropSize / 3, sideTolerance)) {
			return 'ns-resize';
		}
		if (nearSideH(mouseX, mouseY, cropX, cropY + cropSize / 2, sideTolerance, cropSize / 3)) {
			return 'ew-resize';
		}
		if (nearSideH(mouseX, mouseY, cropX + cropSize, cropY + cropSize / 2, sideTolerance, cropSize / 3)) {
			return 'ew-resize';
		}

		// Inside crop area
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

<div class="mb-4">
	<div class="font-bold">
		{label} {#if !currentLogo}*{/if}
	</div>

	<div class="flex items-start gap-4">
		{#if previewUrl}
			<div class="flex-shrink-0">
				<img
					src={previewUrl}
					alt="Logo preview"
					class="w-24 h-24 object-cover border border-border rounded"
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

			<Button
				type="button"
				onclick={triggerFileSelect}
				disabled={processing}
				variant="primary"
			>
				{processing ? 'Processing...' : previewUrl ? 'Change Logo' : 'Upload Logo'}
			</Button>

			<p class="text-xs text-muted-foreground mt-2">
				Image must be square, between 100x100 and 400x400 pixels. Non-square images will be cropped.
			</p>

			{#if error}
				<p class="text-sm text-destructive mt-2">{error}</p>
			{/if}
		</div>
	</div>
</div>

{#if showCropModal}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onkeydown={(e) => e.key === 'Escape' && cancelCrop()} role="dialog" aria-modal="true">
		<div class="bg-card rounded-lg shadow-xl max-w-[90vw] max-h-[90vh] overflow-hidden border border-border">
			<div class="p-4 sm:p-6">
				<h3 class="text-lg font-semibold text-foreground mb-2">Crop Image</h3>

				<p class="text-sm text-muted-foreground mb-4">
					Drag to move. Use corner or side handles to resize. The crop must be square.
				</p>

				{#if validation}
					<div class="mb-4 bg-muted/50 p-3 rounded-lg flex items-center justify-center">
						<canvas
							bind:this={cropCanvas}
							width={canvasWidth}
							height={canvasHeight}
							class="border border-border rounded shadow-sm"
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

				<div class="flex justify-end gap-3">
					<Button
						type="button"
						onclick={cancelCrop}
						disabled={processing}
						variant="secondary"
					>
						Cancel
					</Button>
					<Button
						type="button"
						onclick={applyCrop}
						disabled={processing}
						variant="primary"
					>
						{processing ? 'Processing...' : 'Apply Crop'}
					</Button>
				</div>
			</div>
		</div>
	</div>
{/if}
