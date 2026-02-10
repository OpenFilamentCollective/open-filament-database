<script>
  import ImageCropModal from './ImageCropModal.svelte';

  export let id, title, errorVar, file, required = false;
  export let currentLogo = null;

  let showCropModal = false;
  let selectedFile = null;
  let croppedPreview = null;
  let fileInput;

  function handleFileSelect(e) {
    const input = e.target;
    if (input.files && input.files.length > 0) {
      selectedFile = input.files[0];
      showCropModal = true;
    }
  }

  function handleCropConfirm(croppedFile) {
    showCropModal = false;

    // Create a preview URL
    if (croppedPreview) URL.revokeObjectURL(croppedPreview);
    croppedPreview = URL.createObjectURL(croppedFile);

    // Create a new FileList via DataTransfer to replace the bound files
    const dt = new DataTransfer();
    dt.items.add(croppedFile);
    file = dt.files;

    // Also update the input element directly
    if (fileInput) {
      fileInput.files = dt.files;
    }

    selectedFile = null;
  }

  function handleCropCancel() {
    showCropModal = false;
    selectedFile = null;
    // Clear the file input
    if (fileInput) {
      fileInput.value = '';
    }
  }
</script>

<div>
  <label for={id} class="block font-medium mb-1">
    {title}
    {#if required}
      <span class="text-red-500">*</span>
    {/if}
  </label>

  {#if currentLogo && !croppedPreview}
    <div class="mb-3">
      <p class="text-sm text-gray-600 dark:text-gray-400 mb-2">Current logo:</p>
      <img
        src={currentLogo}
        alt="Current logo"
        class="w-24 h-24 rounded-lg object-contain bg-white shadow-sm border border-gray-200 dark:border-gray-600"
      />
    </div>
  {/if}

  {#if croppedPreview}
    <div class="mb-3">
      <p class="text-sm text-gray-600 dark:text-gray-400 mb-2">New logo preview:</p>
      <img
        src={croppedPreview}
        alt="Cropped logo preview"
        class="w-24 h-24 rounded-lg object-contain bg-white shadow-sm border border-gray-200 dark:border-gray-600"
      />
    </div>
  {/if}

  <input
    bind:this={fileInput}
    id={id}
    type="file"
    name={id}
    accept="image/png, image/jpeg, image/svg+xml"
    onchange={handleFileSelect}
    class="block w-full text-sm text-gray-700 dark:text-gray-200 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-gray-800 dark:file:text-blue-400"
  />
  {#if errorVar}
    <span class="text-red-600 text-xs">{errorVar}</span>
  {/if}
</div>

<ImageCropModal
  bind:isOpen={showCropModal}
  imageFile={selectedFile}
  onConfirm={handleCropConfirm}
  onCancel={handleCropCancel}
/>
