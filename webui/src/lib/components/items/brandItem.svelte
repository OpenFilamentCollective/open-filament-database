<script lang="ts">
  import { stripOfIllegalChars } from "$lib/globalHelpers";

  let { brandName, brandData, imgOverride = undefined } = $props();
  console.log(brandData)
</script>

<a
  href={`/Brand/${brandName}`}
  class="flex flex-col items-center justify-center p-6 bg-white rounded-xl shadow-lg hover:shadow-xl transition-shadow duration-300 space-y-4 w-48 border border-gray-200 dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100 text-gray-900">
  <img
    src={imgOverride ? imgOverride : `/data/${stripOfIllegalChars(brandData.id)}/${brandData.logo}`}
    alt={brandName + ' logo'}
    class="w-20 h-20 mb-2 rounded-lg object-contain bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700"
    loading="lazy" />
  <h2 class="text-lg font-bold text-gray-800 dark:text-gray-100 text-center">
    {brandData.brand}
  </h2>
</a>
