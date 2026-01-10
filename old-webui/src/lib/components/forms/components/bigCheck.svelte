<script>
  export let formVar, description, errorVar = null, idPrefix = "", title = "Discontinued", required = false;
</script>

<div>
  <div>
    <div class="flex flex-row items-center">
      <input
      id={`${idPrefix}discontinued`}
      type="checkbox"
      name={`${idPrefix}discontinued`}
      class="accent-blue-600 w-4 h-4 mr-2"
      autocomplete="off"
      aria-autocomplete="none"
      bind:checked={formVar} />

      <label for={`${idPrefix}discontinued`} class="inline-block font-medium">
        {title}
        {#if required}
          <span class="text-red-500">*</span>
        {/if}
      </label>
    </div>
    <p class="text-sm text-gray-600 dark:text-gray-400 mb-2">
        {description} 
      </p>
  </div>
  {#if errorVar}
    <span class="text-red-600 text-xs">{errorVar}</span>
  {/if}
</div>