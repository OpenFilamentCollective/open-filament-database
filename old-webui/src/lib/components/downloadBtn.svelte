<script lang="ts">
  let { brandName, materialName, filamentName } = $props();

  async function downloadFilament(brand: string, material: string, filament: string) {
    try {
      const url = `/api/download/${encodeURIComponent(brand)}/${encodeURIComponent(material)}/${encodeURIComponent(filament)}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/zip',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `${filament}.zip`;
      document.body.appendChild(a);
      a.click();

      // Cleanup
      window.URL.revokeObjectURL(downloadUrl);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Download failed:', error);
      alert('Failed to download file. Check console for details.');
    }
  }
</script>

<button
  type="button"
  class="flex items-center gap-2 p-2 mb-2 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-green-100 hover:text-green-700 dark:hover:bg-green-900 dark:hover:text-green-300 shadow transition-colors"
  aria-label="Download All Variants"
  onclick={() => downloadFilament(brandName, materialName, filamentName)}>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    class="w-5 h-5"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    stroke-width="2">
    <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v12m0 0l-6-6m6 6l6-6" />
  </svg>
  <span class="text-sm font-medium">Download All Variants</span>
</button>
