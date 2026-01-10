<script>
  let { children } = $props();
</script>

<button
  type="submit"
  class="w-full py-2 px-4 rounded-lg bg-blue-600 text-white font-semibold shadow hover:bg-blue-700 transition-colors"
>
  {#if children}
    {@render children()}
  {/if}
</button>