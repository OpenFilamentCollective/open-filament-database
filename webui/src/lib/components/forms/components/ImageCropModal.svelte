<script lang="ts">
  import { onDestroy, untrack } from 'svelte';

  interface Props {
    isOpen: boolean;
    imageFile: File | null;
    onConfirm: (croppedFile: File) => void;
    onCancel: () => void;
  }

  let { isOpen = $bindable(), imageFile, onConfirm, onCancel }: Props = $props();

  const OUTPUT_SIZE = 400;
  const WORK_SIZE = 600;
  const MIN_CROP = 30;

  let img: HTMLImageElement | null = $state(null);
  let imgLoaded = $state(false);
  let imgSrc = $state('');

  // Image display dimensions (scaled so longest axis = WORK_SIZE)
  let displayW = $state(0);
  let displayH = $state(0);
  let displayScale = $state(1);

  // Image position in work area (centered)
  let imgLeft = $derived(Math.round((WORK_SIZE - displayW) / 2));
  let imgTop = $derived(Math.round((WORK_SIZE - displayH) / 2));

  // Crop selection in work-area coordinates
  let cropX = $state(0);
  let cropY = $state(0);
  let cropSize = $state(100);

  // Drag state
  type DragType = 'move' | 'nw' | 'ne' | 'sw' | 'se';
  let dragType: DragType | null = $state(null);
  let dragStartMouseX = 0;
  let dragStartMouseY = 0;
  let dragInitCropX = 0;
  let dragInitCropY = 0;
  let dragInitCropSize = 0;

  $effect(() => {
    if (isOpen && imageFile) {
      untrack(() => loadImage(imageFile));
    } else if (!isOpen) {
      untrack(() => cleanup());
    }
  });

  function cleanup() {
    if (imgSrc) {
      URL.revokeObjectURL(imgSrc);
      imgSrc = '';
    }
    imgLoaded = false;
    img = null;
  }

  function loadImage(file: File) {
    cleanup();
    imgSrc = URL.createObjectURL(file);
    const newImg = new Image();
    newImg.onload = () => {
      img = newImg;
      // Scale so the longest axis fills the work area exactly
      const scale = Math.min(WORK_SIZE / newImg.width, WORK_SIZE / newImg.height);
      displayScale = scale;
      displayW = Math.round(newImg.width * scale);
      displayH = Math.round(newImg.height * scale);
      padToSquare();
      imgLoaded = true;
    };
    newImg.src = imgSrc;
  }

  function padToSquare() {
    // Crop = longest axis (= WORK_SIZE), centered
    cropSize = WORK_SIZE;
    cropX = 0;
    cropY = 0;
    clampCrop();
  }

  function centerCrop() {
    // Crop = shortest axis, centered on image
    const minDim = Math.round(Math.min(displayW, displayH));
    cropSize = minDim;
    cropX = Math.round((WORK_SIZE - minDim) / 2);
    cropY = Math.round((WORK_SIZE - minDim) / 2);
    clampCrop();
  }

  function clampCrop() {
    cropSize = Math.round(Math.max(MIN_CROP, Math.min(cropSize, WORK_SIZE)));
    cropX = Math.round(Math.max(0, Math.min(cropX, WORK_SIZE - cropSize)));
    cropY = Math.round(Math.max(0, Math.min(cropY, WORK_SIZE - cropSize)));
  }

  function startDrag(e: MouseEvent, type: DragType) {
    e.preventDefault();
    e.stopPropagation();
    dragType = type;
    dragStartMouseX = e.clientX;
    dragStartMouseY = e.clientY;
    dragInitCropX = cropX;
    dragInitCropY = cropY;
    dragInitCropSize = cropSize;
    window.addEventListener('mousemove', onDrag);
    window.addEventListener('mouseup', endDrag);
  }

  function onDrag(e: MouseEvent) {
    if (!dragType) return;
    const dx = e.clientX - dragStartMouseX;
    const dy = e.clientY - dragStartMouseY;

    if (dragType === 'move') {
      cropX = dragInitCropX + dx;
      cropY = dragInitCropY + dy;
    } else if (dragType === 'se') {
      cropSize = dragInitCropSize + Math.max(dx, dy);
    } else if (dragType === 'sw') {
      const delta = Math.max(-dx, dy);
      const newSize = dragInitCropSize + delta;
      cropX = dragInitCropX + dragInitCropSize - newSize;
      cropSize = newSize;
    } else if (dragType === 'ne') {
      const delta = Math.max(dx, -dy);
      const newSize = dragInitCropSize + delta;
      cropY = dragInitCropY + dragInitCropSize - newSize;
      cropSize = newSize;
    } else if (dragType === 'nw') {
      const delta = Math.max(-dx, -dy);
      const newSize = dragInitCropSize + delta;
      cropX = dragInitCropX + dragInitCropSize - newSize;
      cropY = dragInitCropY + dragInitCropSize - newSize;
      cropSize = newSize;
    }
    clampCrop();
  }

  function endDrag() {
    dragType = null;
    window.removeEventListener('mousemove', onDrag);
    window.removeEventListener('mouseup', endDrag);
  }

  function startTouchDrag(e: TouchEvent, type: DragType) {
    e.preventDefault();
    e.stopPropagation();
    if (e.touches.length !== 1) return;
    dragType = type;
    dragStartMouseX = e.touches[0].clientX;
    dragStartMouseY = e.touches[0].clientY;
    dragInitCropX = cropX;
    dragInitCropY = cropY;
    dragInitCropSize = cropSize;
    window.addEventListener('touchmove', onTouchDrag, { passive: false });
    window.addEventListener('touchend', endTouchDrag);
  }

  function onTouchDrag(e: TouchEvent) {
    e.preventDefault();
    if (e.touches.length !== 1 || !dragType) return;
    onDrag({ clientX: e.touches[0].clientX, clientY: e.touches[0].clientY } as MouseEvent);
  }

  function endTouchDrag() {
    dragType = null;
    window.removeEventListener('touchmove', onTouchDrag);
    window.removeEventListener('touchend', endTouchDrag);
  }

  async function handleConfirm() {
    if (!img || !imageFile) return;

    // Convert crop from display coords to original image coords
    const origCropX = (cropX - imgLeft) / displayScale;
    const origCropY = (cropY - imgTop) / displayScale;
    const origCropSize = cropSize / displayScale;

    const isSvg = imageFile.type === 'image/svg+xml' || imageFile.name.toLowerCase().endsWith('.svg');

    if (isSvg) {
      // SVG: wrap in a new SVG with viewBox for cropping, no rasterization
      const svgText = await imageFile.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(svgText, 'image/svg+xml');
      const originalSvg = doc.documentElement;

      // Ensure the inner SVG has a viewBox so its content scales when we resize it.
      // Without a viewBox, the SVG's coordinate system matches its width/height —
      // changing those would clip or overflow instead of scaling.
      if (!originalSvg.getAttribute('viewBox')) {
        const origW = parseFloat(originalSvg.getAttribute('width') || '') || img.naturalWidth;
        const origH = parseFloat(originalSvg.getAttribute('height') || '') || img.naturalHeight;
        originalSvg.setAttribute('viewBox', `0 0 ${origW} ${origH}`);
      }

      // Set explicit position and dimensions on the inner SVG
      originalSvg.setAttribute('x', '0');
      originalSvg.setAttribute('y', '0');
      originalSvg.setAttribute('width', String(img.naturalWidth));
      originalSvg.setAttribute('height', String(img.naturalHeight));
      originalSvg.setAttribute('overflow', 'hidden');

      // Create wrapper SVG with viewBox that crops to the selection
      const wrapper = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      wrapper.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      wrapper.setAttribute('width', String(OUTPUT_SIZE));
      wrapper.setAttribute('height', String(OUTPUT_SIZE));
      wrapper.setAttribute('viewBox', `${origCropX} ${origCropY} ${origCropSize} ${origCropSize}`);
      wrapper.appendChild(originalSvg);

      const serializer = new XMLSerializer();
      const svgString = serializer.serializeToString(wrapper);
      const blob = new Blob([svgString], { type: 'image/svg+xml' });
      onConfirm(new File([blob], 'logo.svg', { type: 'image/svg+xml' }));
    } else {
      // Raster: render to canvas as PNG
      const canvas = document.createElement('canvas');
      canvas.width = OUTPUT_SIZE;
      canvas.height = OUTPUT_SIZE;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

      const s = OUTPUT_SIZE / origCropSize;
      ctx.drawImage(img, -origCropX * s, -origCropY * s, img.width * s, img.height * s);

      canvas.toBlob((blob) => {
        if (!blob) return;
        onConfirm(new File([blob], 'logo.png', { type: 'image/png' }));
      }, 'image/png');
    }
  }

  onDestroy(() => {
    cleanup();
    if (typeof window !== 'undefined') {
      window.removeEventListener('mousemove', onDrag);
      window.removeEventListener('mouseup', endDrag);
      window.removeEventListener('touchmove', onTouchDrag);
      window.removeEventListener('touchend', endTouchDrag);
    }
  });
</script>

{#if isOpen}
  <div
    class="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
    role="dialog"
    aria-modal="true"
    aria-label="Crop Logo"
  >
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div
      class="bg-white dark:bg-gray-800 rounded-lg p-8 max-w-3xl w-full mx-4"
      onclick={(e) => e.stopPropagation()}
    >
      <h2 class="text-2xl font-bold mb-2 dark:text-white">Crop Logo</h2>
      <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
        Drag to move the selection, drag corners to resize. The result will be a square image.
      </p>

      <div class="flex gap-2 mb-4">
        <button
          type="button"
          onclick={padToSquare}
          class="px-4 py-2 text-sm bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-white rounded transition-colors"
        >
          Pad to Square
        </button>
        <button
          type="button"
          onclick={centerCrop}
          class="px-4 py-2 text-sm bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-white rounded transition-colors"
        >
          Center Crop
        </button>
      </div>

      <!-- Work area wrapper (no overflow hidden, so handles can extend outside) -->
      <div
        class="relative mx-auto select-none"
        style="width: {WORK_SIZE}px; height: {WORK_SIZE}px; touch-action: none;"
      >
        <!-- Clipped layer: image + dim overlay -->
        <div
          class="absolute inset-0 overflow-hidden rounded border border-gray-300 dark:border-gray-600"
          style="
            background-color: #e8e8e8;
            background-image:
              linear-gradient(45deg, #d0d0d0 25%, transparent 25%, transparent 75%, #d0d0d0 75%),
              linear-gradient(45deg, #d0d0d0 25%, transparent 25%, transparent 75%, #d0d0d0 75%);
            background-size: 16px 16px;
            background-position: 0 0, 8px 8px;
          "
        >
          {#if imgLoaded && imgSrc}
            <img
              src={imgSrc}
              alt="Logo to crop"
              class="absolute pointer-events-none"
              style="left: {imgLeft}px; top: {imgTop}px; width: {displayW}px; height: {displayH}px;"
              draggable="false"
            />

            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <!-- Crop selection with dim overlay via box-shadow -->
            <div
              class="absolute"
              class:cursor-move={dragType === null || dragType === 'move'}
              style="
                left: {cropX}px;
                top: {cropY}px;
                width: {cropSize}px;
                height: {cropSize}px;
                box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.45);
              "
              onmousedown={(e) => startDrag(e, 'move')}
              ontouchstart={(e) => startTouchDrag(e, 'move')}
            ></div>
          {:else}
            <div class="flex items-center justify-center h-full text-gray-500 text-lg">Loading...</div>
          {/if}
        </div>

        <!-- Handles layer (outside overflow-hidden so they don't get clipped) -->
        {#if imgLoaded && imgSrc}
          <div
            class="absolute pointer-events-none border-2 border-blue-500"
            style="left: {cropX}px; top: {cropY}px; width: {cropSize}px; height: {cropSize}px;"
          >
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="absolute -top-2 -left-2 w-4 h-4 bg-white border-2 border-blue-500 rounded-sm cursor-nw-resize pointer-events-auto"
              onmousedown={(e) => startDrag(e, 'nw')}
              ontouchstart={(e) => startTouchDrag(e, 'nw')}
            ></div>
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="absolute -top-2 -right-2 w-4 h-4 bg-white border-2 border-blue-500 rounded-sm cursor-ne-resize pointer-events-auto"
              onmousedown={(e) => startDrag(e, 'ne')}
              ontouchstart={(e) => startTouchDrag(e, 'ne')}
            ></div>
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="absolute -bottom-2 -left-2 w-4 h-4 bg-white border-2 border-blue-500 rounded-sm cursor-sw-resize pointer-events-auto"
              onmousedown={(e) => startDrag(e, 'sw')}
              ontouchstart={(e) => startTouchDrag(e, 'sw')}
            ></div>
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="absolute -bottom-2 -right-2 w-4 h-4 bg-white border-2 border-blue-500 rounded-sm cursor-se-resize pointer-events-auto"
              onmousedown={(e) => startDrag(e, 'se')}
              ontouchstart={(e) => startTouchDrag(e, 'se')}
            ></div>
          </div>
        {/if}
      </div>

      <div class="flex gap-3 justify-end mt-5">
        <button
          type="button"
          onclick={onCancel}
          class="px-5 py-2.5 bg-gray-300 hover:bg-gray-400 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-800 dark:text-white font-semibold rounded transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onclick={handleConfirm}
          disabled={!imgLoaded}
          class="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Confirm
        </button>
      </div>
    </div>
  </div>
{/if}
