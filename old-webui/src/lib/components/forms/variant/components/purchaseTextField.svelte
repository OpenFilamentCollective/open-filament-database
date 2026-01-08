<script>
  export let id, title, placeholder, formVar, errorVar = null, required = false, classes;
</script>

<div class={classes}>
  <label for={id} class="block font-medium mb-1 text-sm">
    {title}
    {#if required}
      <span class="text-red-500">*</span>
    {/if}
  </label>
  <input
    id={id}
    type="text"
    name={id}
    aria-required={required ? "true" : "false"}
    aria-describedby={`${id}-help`}
    placeholder={placeholder}
    autocomplete="off"
    aria-autocomplete="none"
    class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
    aria-invalid={errorVar ? 'true' : undefined}
    bind:value={formVar} >
  
  {#if errorVar}
    <span class="text-red-600 text-xs">{errorVar}</span>
  {/if}
</div>