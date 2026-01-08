<script>
  export let id, formVar, title;
</script>

<div class="flex items-center gap-2">
  <input
    id={id}
    type="checkbox"
    name={id}
    class="accent-blue-600 w-4 h-4"
    autocomplete="off"
    aria-autocomplete="none"
    bind:checked={formVar} />
  <label for={id} class="font-medium text-sm">{title}</label>
</div>