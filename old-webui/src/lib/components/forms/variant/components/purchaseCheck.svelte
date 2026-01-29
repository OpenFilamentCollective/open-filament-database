<script>
  export let id, title, formVar, errorVar, required = false;
</script>

<div>
  <div  class="flex items-center gap-2">
    <input
      id={id}
      type="checkbox"
      name={id}
      class="accent-blue-600 w-4 h-4"
      autocomplete="off"
      aria-autocomplete="none"
      bind:checked={formVar} />
    <label for={id} class="font-medium text-sm">
      {title}
      {#if required}
        <span class="text-red-500">*</span>
      {/if}
    </label>
  </div>

  {#if errorVar}
    <span class="text-red-600 text-xs">{errorVar}</span>
  {/if}
</div>