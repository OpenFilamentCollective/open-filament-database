<script lang="ts">
  import { env } from '$env/dynamic/public';
  import { filamentVariantSchema } from '$lib/validation/filament-variant-schema';
  import { realDelete } from '$lib/realDeleter';
  import { pseudoDelete } from '$lib/pseudoDeleter';
  import { writable } from 'svelte/store';
  import BigCheck from '../components/bigCheck.svelte';
  import Form from '../components/form.svelte';
  import DeleteButton from '../components/deleteButton.svelte';
  import SubmitButton from '../components/submitButton.svelte';
  import HexesList from './components/hexesList.svelte';
  import TextField from '../components/textField.svelte';
  import Size from './components/size.svelte';
  import TraitAdder from './components/traitAdder.svelte';
  import { superForm } from 'sveltekit-superforms';
  import { zodClient } from 'sveltekit-superforms/adapters';

  type formType = 'edit' | 'create';
  let { defaultForm, formType, brandId, materialId, filamentId, stores, colorData = null } = $props();

  const {
    form,
    errors,
    message,
    enhance,
  } = superForm(defaultForm, {
    dataType: 'json',
    resetForm: false,
    invalidateAll: false,
    clearOnSubmit: "none",
    validationMethod: 'onblur',
    validators: zodClient(filamentVariantSchema)
  });

  async function handleDelete() {
    if (
      confirm(
        `Are you sure you want to delete the instance "${colorData.name}"? This action cannot be undone.`,
      )
    ) {
      const isLocal = env.PUBLIC_IS_LOCAL === 'true';

      // use the folder `id` when performing filesystem operations
      const instanceId = colorData.id || colorData.name;

      if (isLocal) {
        await realDelete('instance', instanceId, brandId, materialId, filamentId);
      } else {
        pseudoDelete('instance', instanceId, brandId, materialId, filamentId);
      }
    }
  }

  // Function to add a new size 
  function addSize() {
    if (!tempSizes) {
      tempSizes = writable([]);
    }
    tempSizes.update(items => [
      ...items,
      { id: Math.max(0, ...items.map(i => i.id)) + 1, value: { filament_weight: undefined, diameter: undefined } },
    ]);
  }

  // Function to remove a size
  function removeSize(index: number) {
    tempSizes.update(items => items.filter((_, i) => i !== index));
  }

  let tempSizes;

  if (colorData && colorData?.sizes) {
    $form.sizes = colorData.sizes;
    let convertSizes = [];

    colorData.sizes.forEach((element, index) => {
      convertSizes[index] = {
        id : index,
        value : structuredClone(element)
      };
    });

    tempSizes = writable(
      convertSizes,
    );
  } else {
    tempSizes = writable([
      { id: 0, value: { filament_weight: undefined, diameter: undefined } }
    ]);
  }
  
  tempSizes.subscribe((value) => {
    $form.sizes = value.map((x) => x.value);
  });
  
  if (colorData?.variant) {
    form.set(structuredClone(colorData.variant));
    $form.sizes = structuredClone(colorData.sizes);
  }

  // Initialize traits as empty object if not present
  if (!$form.traits) {
    $form.traits = {};
  }
</script>

<Form
  endpoint="variant"
  enhance={enhance}
>
  <div class="flex space-x-4 flex-col md:flex-row">
    <div class="mb-5 md:w-3/5 space-y-4">
      <h3 class="text-xl font-bold mb-4">{formType === 'edit' ? 'Edit' : 'Create'} Color Variant</h3>

      <TextField
        id="name"
        title="Color name"
        description="Enter the official color name as specified by the manufacturer"
        placeholder="e.g. Galaxy Black"
        bind:formVar={$form.name}
        errorVar={$errors.name}
        required={true}
      />

      <HexesList
        idPrefix="color_hex_"
        title="Color hexes"
        description="Choose the color(s) or enter the hex code that best represents this filament color"
        bind:hexes={$form.color_hex}
        errorVar={$errors.color_hex}
        required={true}
      />

      <BigCheck
        idPrefix="variant_"
        bind:formVar={$form.discontinued}
        errorVar={$errors.discontinued}
        description="Select if this colour/variant is discontinued"
      />

      <TraitAdder bind:formTraits={$form.traits} />
    </div>

    <fieldset class="md:w-2/5">
      {#if $tempSizes.length <= 0 || $errors?.sizes?._errors?.[0]}
        <span class="text-red-600 text-xs">{$errors?.sizes?._errors?.[0] || "You need at least one size"}</span>
      {/if}

      <div class="flex items-center justify-between mb-4">
        <h3 class="text-xl font-bold mb-4">
          {formType === 'edit' ? 'Edit' : 'Add'} Sizes
          <span class="text-red-500">*</span>
        </h3>
        <button
          type="button"
          onclick={addSize}
          class="text-sm px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 transition-colors">
          + Add Size
        </button>
      </div>

      {#if $tempSizes && $tempSizes.length > 0}
        <div class="space-y-5">
          {#each $tempSizes as size, index (size.id)}
            <Size
              bind:size={$tempSizes[index].value}
              sizeIndex={index}
              removeSize={removeSize}
              errors={errors}
              stores={stores}
            />
          {/each}
        </div>
      {:else}
        <div class="text-center py-4 text-gray-500 dark:text-gray-400">
          <p class="text-sm">No sizes added yet.</p>
          <p class="text-xs mt-1">Click "Add Size" to add sizes.</p>
        </div>
      {/if}
    </fieldset>
  </div>

  <SubmitButton>
    {formType === 'edit' ? 'Save' : 'Create'}
  </SubmitButton>  

  {#if formType === 'edit'}
    <DeleteButton
      handleDelete={handleDelete}
    />
  {/if}
</Form>
