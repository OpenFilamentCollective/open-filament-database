<script lang="ts">
  import NumberField from "../../components/numberField.svelte";
  type slicerField = {
    id: string,
    title: string,
    description: string,
    placeholder: string,
    formVar: any,
    errorVar: any
  };

  export let id_prefix, title, tempOverrides = null, showOverrideLabel=true;
</script>

<fieldset class="border border-gray-200 dark:border-gray-700 rounded p-4 mb-4">
  <legend class="font-semibold text-base mb-2">
    {title}
  </legend>
  <div class="space-y-4">
    <slot/>

    {#if showOverrideLabel}
      <p class="text-lg font-bold mb-2">Temperature Overrides</p>
    {/if}
    <div class="grid grid-cols-2 gap-4">
      {#each tempOverrides as field}
        <NumberField
          id={`${id_prefix}${field.id}`}
          title={field.title}
          description={field.description}
          placeholder={field.placeholder}
          bind:formVar={field.formVar}
          errorVar={field.errorVar}
        />
      {/each}
    </div>
  </div>
</fieldset>