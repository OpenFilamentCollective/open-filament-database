<script>
  export let size;
</script>

<div
  class="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-800">
  <div class="space-y-3">
    <div class="flex justify-between items-center">
      <span class="font-medium text-gray-700 dark:text-gray-300">Weight:</span>
      <span class="font-semibold">{size.filament_weight}g</span>
    </div>

    <div class="flex justify-between items-center">
      <span class="font-medium text-gray-700 dark:text-gray-300">Diameter:</span>
      <span class="font-semibold">{size.diameter}mm</span>
    </div>

    {#if size.empty_spool_weight}
      <div class="flex justify-between items-center">
        <span class="font-medium text-gray-700 dark:text-gray-300">Empty Spool:</span>
        <span class="font-semibold">{size.empty_spool_weight}g</span>
      </div>
    {/if}

    {#if size.gtin}
      <div class="flex justify-between items-center">
        <span class="font-medium text-gray-700 dark:text-gray-300">GTIN:</span>
        <span class="font-mono text-sm">{size.gtin}</span>
      </div>
    {/if}

    {#if size.ean}
      <div class="flex justify-between items-center">
        <span class="font-medium text-gray-700 dark:text-gray-300">EAN:</span>
        <span class="font-mono text-sm">{size.ean}</span>
      </div>
    {/if}

    {#if size.article_number}
      <div class="flex justify-between items-center">
        <span class="font-medium text-gray-700 dark:text-gray-300">Article Number:</span>
        <span class="font-mono text-sm">{size.article_number}</span>
      </div>
    {/if}

    {#if size.spool_refill}
      <div class="flex items-center gap-2 text-blue-600 dark:text-blue-400">
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        <span class="text-sm font-medium">Refill</span>
      </div>
    {/if}
  </div>

  {#if size.purchase_links && size.purchase_links.length > 0}
    <div class="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
      <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        Purchase Links:
      </h4>
      <div class="space-y-2">
        {#each size.purchase_links as link}
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            class="flex items-center justify-between text-sm text-blue-600 dark:text-blue-400 hover:underline">
            <span>{link.store_id}</span>
          </a>
        {/each}
      </div>
    </div>
  {/if}
</div>