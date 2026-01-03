<script>
  export let id, title, description, placeholder, formVar, step="0.01", classes = "", errorVar = null, required = false;
</script>

<div class="{classes}">
  <label for={id} class="block font-medium mb-1">
    {title}
    {#if required}
      <span class="text-red-500">*</span>
    {/if}
  </label>
  <p class="text-sm text-gray-600 dark:text-gray-400 mb-2">
    {description}
  </p>
  <input
    id={id}
    type="number"
    step={step}
    name={id}
    aria-required={required ? "true" : "false"}
    aria-describedby={`${id}-help`}
    placeholder={placeholder}
    autocomplete="off"
    aria-autocomplete="none"
    class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
    aria-invalid={errorVar ? 'true' : undefined}
    bind:value={formVar} />

  {#if errorVar}
    <span class="text-red-600 text-xs">{errorVar}</span>
  {/if}
</div>