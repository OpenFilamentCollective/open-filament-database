<script>
  export let id, title, options, formVar, errorVar = null, required = false, classes = "";
</script>

<div class={classes}>
  <label for={id} class="block font-medium mb-1 text-sm">
    {title}
    {#if required}
      <span class="text-red-500">*</span>
    {/if}
  </label>
  <select
    bind:value={formVar}
    name={id}
    id={id}
    class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
  >
    <option value="">-- Select --</option>
    {#each options as opt}
      <option value={opt}>{opt}</option>
    {/each}
  </select>
  {#if errorVar}
    <span class="text-red-600 text-xs">{errorVar}</span>
  {/if}
</div>