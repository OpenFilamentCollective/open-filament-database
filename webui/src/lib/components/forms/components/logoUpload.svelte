<script>
  export let id, title, errorVar, file, required = false;
</script>


<div>
  <label for={id} class="block font-medium mb-1">
    {title}
    {#if required}
      <span class="text-red-500">*</span>
    {/if}
  </label>
  <input
    id={id}
    type="file"
    name={id}
    accept="image/png, image/jpeg, image/svg+xml"
    bind:files={file}
    class="block w-full text-sm text-gray-700 dark:text-gray-200 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-gray-800 dark:file:text-blue-400" />
  {#if errorVar}
    <span class="text-red-600 text-xs">{errorVar}</span>
  {/if}
</div>