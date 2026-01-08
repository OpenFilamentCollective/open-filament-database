<script lang="ts">
  import { env } from '$env/dynamic/public';
  import { pseudoDelete, } from '$lib/pseudoDeleter';
  import { realDelete } from '$lib/realDeleter';
  import { intProxy, stringProxy } from 'sveltekit-superforms';
  import Form from '../components/form.svelte';
  import TextField from '../components/textField.svelte';
  import NumberField from '../components/numberField.svelte';
  import SubmitButton from '../components/submitButton.svelte';
  import DeleteButton from '../components/deleteButton.svelte';
  import { superForm } from 'sveltekit-superforms';
  import { zodClient } from 'sveltekit-superforms/adapters';
  import { filamentMaterialSchema } from '$lib/validation/filament-material-schema';
  import { MATERIAL_TYPES } from '$lib/validation/filament-material-schema';

  type formType = 'edit' | 'create';
  let { defaultForm, formType, brandId } = $props();
  
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
    validators: zodClient(filamentMaterialSchema)
  });
  
  async function handleDelete() {
    if (
      confirm(
        `Are you sure you want to delete the material "${$form.material}"? This action cannot be undone.`,
      )
    ) {
      const isLocal = env.PUBLIC_IS_LOCAL === 'true';

      if (isLocal) {
        await realDelete('material', $form.material, brandId);
      } else {
        pseudoDelete('material', $form.material, brandId);
      }
    }
  }

  const slicerOptions = [
    { key: 'generic', label: 'Generic' },
    { key: 'prusaslicer', label: 'PrusaSlicer' },
    { key: 'bambustudio', label: 'Bambu Studio' },
    { key: 'orcaslicer', label: 'OrcaSlicer' },
    { key: 'cura', label: 'Cura' },
  ];

  let selectedSlicer: string[] = $state([]);

  Array.from(slicerOptions).forEach((val) => {
    let key = val.key;

    if ($form?.default_slicer_settings?.[key]) {
      Object.values($form?.default_slicer_settings?.[key]).forEach(element => {
        if (element && !selectedSlicer.includes(key)) {
          selectedSlicer.push(key);
        }
      });
    }
  });

  // Proxies are needed for nested properties to work correctly with sveltekit-superforms
  const generic_flbt = intProxy(form, 'default_slicer_settings.generic.first_layer_bed_temp');
  const generic_flnt = intProxy(form, 'default_slicer_settings.generic.first_layer_nozzle_temp');
  const generic_bt = intProxy(form, 'default_slicer_settings.generic.bed_temp');
  const generic_nt = intProxy(form, 'default_slicer_settings.generic.nozzle_temp');

  const prusa_prof = stringProxy(
    form,
    "default_slicer_settings.prusaslicer.profile_name",
    {
      empty: "undefined"
    }
  );
  const prusa_flbt = intProxy(form, 'default_slicer_settings.prusaslicer.first_layer_bed_temp');
  const prusa_flnt = intProxy(form, 'default_slicer_settings.prusaslicer.first_layer_nozzle_temp');
  const prusa_bt = intProxy(form, 'default_slicer_settings.prusaslicer.bed_temp');
  const prusa_nt = intProxy(form, 'default_slicer_settings.prusaslicer.nozzle_temp');

  const bambu_prof = stringProxy(
    form,
    "default_slicer_settings.bambustudio.profile_name",
    {
      empty: "undefined"
    }
  );
  const bambu_flbt = intProxy(form, 'default_slicer_settings.bambustudio.first_layer_bed_temp');
  const bambu_flnt = intProxy(form, 'default_slicer_settings.bambustudio.first_layer_nozzle_temp');
  const bambu_bt = intProxy(form, 'default_slicer_settings.bambustudio.bed_temp');
  const bambu_nt = intProxy(form, 'default_slicer_settings.bambustudio.nozzle_temp');

  const orca_prof = stringProxy(
    form,
    "default_slicer_settings.orcaslicer.profile_name",
    {
      empty: "undefined"
    }
  );
  const orca_flbt = intProxy(form, 'default_slicer_settings.orcaslicer.first_layer_bed_temp');
  const orca_flnt = intProxy(form, 'default_slicer_settings.orcaslicer.first_layer_nozzle_temp');
  const orca_bt = intProxy(form, 'default_slicer_settings.orcaslicer.bed_temp');
  const orca_nt = intProxy(form, 'default_slicer_settings.orcaslicer.nozzle_temp');

  const cura_prof = stringProxy(
    form,
    "default_slicer_settings.cura.profile_name",
    {
      empty: "undefined"
    }
  );
  const cura_flbt = intProxy(form, 'default_slicer_settings.cura.first_layer_bed_temp');
  const cura_flnt = intProxy(form, 'default_slicer_settings.cura.first_layer_nozzle_temp');
  const cura_bt = intProxy(form, 'default_slicer_settings.cura.bed_temp');
  const cura_nt = intProxy(form, 'default_slicer_settings.cura.nozzle_temp');
</script>

<Form
  endpoint="material"
  enhance={enhance}
>
  <div class="mb-4">
    <label for="material" class="block font-medium mb-1 text-sm">
      Material name
      <span class="text-sm font-normal text-gray-600 dark:text-gray-400"> — Enter the material type or category (e.g., "PLA", "PETG", "ABS", "TPU")</span>
      <span class="text-red-500">*</span>
    </label>
    <select
      id="material"
      name="material"
      bind:value={$form.material}
      required
      class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
    >
      <option value="">-- Select --</option>
      {#each MATERIAL_TYPES as m}
        <option value={m}>{m}</option>
      {/each}
    </select>
    {#if $errors.material}
      <span class="text-red-600 text-xs">{$errors.material}</span>
    {/if}
  </div>

  <NumberField
    id="default_max_dry_temperature"
    title="Default Max Dry Temperature"
    description='Default Maximum drying temperature (typically somewhere around 55-65°C)'
    placeholder="e.g. ±55-65°C"
    bind:formVar={$form.default_max_dry_temperature}
    errorVar={$errors.default_max_dry_temperature}
  />

  <div class="slicerSettings space-y-4">
    <p class="block font-medium mb-1">Slicer Type</p>
    <p class="text-sm text-gray-600 dark:text-gray-400 mb-2">
      Select which slicers you want to provide print settings for.
    </p>

    <div class="flex flex-wrap gap-4 mb-4">
      {#each slicerOptions as option}
        <label class="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            value={option.key}
            bind:group={selectedSlicer}
            class="rounded border-gray-300 dark:border-gray-600" />
          {option.label}
        </label>
      {/each}
    </div>

    {#key selectedSlicer}
      <!-- Generic Settings -->
      {#if selectedSlicer.includes('generic')}
        <fieldset class="border border-gray-200 dark:border-gray-700 rounded p-4 mb-4">
          <legend class="font-semibold text-base mb-2">
            Generic
          </legend>
          <div class="space-y-4">
            <div class="grid grid-cols-2 gap-4">
              <NumberField
                id="generic_first_layer_bed_temp"
                title="First Layer Bed Temp (°C)"
                description=""
                placeholder="60"
                bind:formVar={$generic_flbt}
                errorVar={$errors?.default_slicer_settings?.generic?.first_layer_bed_temp}
              />

              <NumberField
                id="generic_first_layer_nozzle_temp"
                title="First Layer Nozzle Temp (°C)"
                description=""
                placeholder="215"
                bind:formVar={$generic_flnt}
                errorVar={$errors?.default_slicer_settings?.generic?.first_layer_nozzle_temp}
              />

              <NumberField
                id="generic_bed_temp"
                title="Bed Temp (°C)"
                description=""
                placeholder="60"
                bind:formVar={$generic_bt}
                errorVar={$errors?.default_slicer_settings?.generic?.bed_temp}
              />

              <NumberField
                id="generic_nozzle_temp"
                title="Nozzle Temp (°C)"
                description=""
                placeholder="210"
                bind:formVar={$generic_nt}
                errorVar={$errors?.default_slicer_settings?.generic?.nozzle_temp}
              />
            </div>
          </div>
        </fieldset>
      {/if}

      <!-- PrusaSlicer Settings -->
      {#if selectedSlicer.includes('prusaslicer')}
        <fieldset class="border border-gray-200 dark:border-gray-700 rounded p-4 mb-4">
          <legend class="font-semibold text-base mb-2">
            PrusaSlicer
          </legend>
          <div class="space-y-4">
            <TextField
              id="prusa_profile_name"
              title="Profile Name"
              description={null}
              placeholder="profiles/filament/PLA_Basic.ini"
              bind:formVar={$prusa_prof}
              errorVar={$errors?.default_slicer_settings?.prusaslicer?.profile_name}
            />

            <p class="text-lg font-bold mb-2">Temperature Overrides</p>
            <div class="grid grid-cols-2 gap-4">
              <NumberField
                id="prusa_first_layer_bed_temp"
                title="First Layer Bed Temp (°C)"
                description=""
                placeholder="60"
                bind:formVar={$prusa_flbt}
                errorVar={$errors?.default_slicer_settings?.prusaslicer?.first_layer_bed_temp}
              />

              <NumberField
                id="prusa_first_layer_nozzle_temp"
                title="First Layer Nozzle Temp (°C)"
                description=""
                placeholder="215"
                bind:formVar={$prusa_flnt}
                errorVar={$errors?.default_slicer_settings?.prusaslicer?.first_layer_nozzle_temp}
              />

              <NumberField
                id="prusa_bed_temp"
                title="Bed Temp (°C)"
                description=""
                placeholder="60"
                bind:formVar={$prusa_bt}
                errorVar={$errors?.default_slicer_settings?.prusaslicer?.bed_temp}
              />

              <NumberField
                id="prusa_nozzle_temp"
                title="Nozzle Temp (°C)"
                description=""
                placeholder="210"
                bind:formVar={$prusa_nt}
                errorVar={$errors?.default_slicer_settings?.prusaslicer?.nozzle_temp}
              />
            </div>
          </div>
        </fieldset>
      {/if}

      <!-- Bambu Studio Settings -->
      {#if selectedSlicer.includes('bambustudio')}
        <fieldset class="border border-gray-200 dark:border-gray-700 rounded p-4 mb-4">
          <legend class="font-semibold text-base mb-2">
            Bambu Studio
          </legend>
          <div class="space-y-4">
            <TextField
              id="bambu_profile_name"
              title="Profile Name"
              description={null}
              placeholder="profiles/filament/PLA_Basic.ini"
              bind:formVar={$bambu_prof}
              errorVar={$errors?.default_slicer_settings?.bambustudio?.profile_name}
            />

            <p class="text-lg font-bold mb-2">Temperature Overrides</p>
            <div class="grid grid-cols-2 gap-4">
              <NumberField
                id="bambu_first_layer_bed_temp"
                title="First Layer Bed Temp (°C)"
                description=""
                placeholder="60"
                bind:formVar={$bambu_flbt}
                errorVar={$errors?.default_slicer_settings?.bambustudio?.first_layer_bed_temp}
              />

              <NumberField
                id="bambu_first_layer_nozzle_temp"
                title="First Layer Nozzle Temp (°C)"
                description=""
                placeholder="215"
                bind:formVar={$bambu_flnt}
                errorVar={$errors?.default_slicer_settings?.bambustudio?.first_layer_nozzle_temp}
              />

              <NumberField
                id="bambu_bed_temp"
                title="Bed Temp (°C)"
                description=""
                placeholder="60"
                bind:formVar={$bambu_bt}
                errorVar={$errors?.default_slicer_settings?.bambustudio?.bed_temp}
              />

              <NumberField
                id="bambu_nozzle_temp"
                title="Nozzle Temp (°C)"
                description=""
                placeholder="210"
                bind:formVar={$bambu_nt}
                errorVar={$errors?.default_slicer_settings?.bambustudio?.nozzle_temp}
              />
            </div>
          </div>
        </fieldset>
      {/if}

      <!-- OrcaSlicer Settings -->
      {#if selectedSlicer.includes('orcaslicer')}
        <fieldset class="border border-gray-200 dark:border-gray-700 rounded p-4 mb-4">
          <legend class="font-semibold text-base mb-2">
            OrcaSlicer
          </legend>
          <div class="space-y-4">
            <TextField
              id="orca_profile_name"
              title="Profile Name"
              description={null}
              placeholder="profiles/filament/PLA_Basic.ini"
              bind:formVar={$orca_prof}
              errorVar={$errors?.default_slicer_settings?.orcaslicer?.profile_name}
            />

            <p class="text-lg font-bold mb-2">Temperature Overrides</p>
            <div class="grid grid-cols-2 gap-4">
              <NumberField
                id="orca_first_layer_bed_temp"
                title="First Layer Bed Temp (°C)"
                description=""
                placeholder="60"
                bind:formVar={$orca_flbt}
                errorVar={$errors?.default_slicer_settings?.orcaslicer?.first_layer_bed_temp}
              />

              <NumberField
                id="orca_first_layer_nozzle_temp"
                title="First Layer Nozzle Temp (°C)"
                description=""
                placeholder="215"
                bind:formVar={$orca_flnt}
                errorVar={$errors?.default_slicer_settings?.orcaslicer?.first_layer_nozzle_temp}
              />

              <NumberField
                id="orca_bed_temp"
                title="Bed Temp (°C)"
                description=""
                placeholder="60"
                bind:formVar={$orca_bt}
                errorVar={$errors?.default_slicer_settings?.orcaslicer?.bed_temp}
              />

              <NumberField
                id="orca_nozzle_temp"
                title="Nozzle Temp (°C)"
                description=""
                placeholder="210"
                bind:formVar={$orca_nt}
                errorVar={$errors?.default_slicer_settings?.orcaslicer?.nozzle_temp}
              />
            </div>
          </div>
        </fieldset>
      {/if}

      <!-- Cura Settings -->
      {#if selectedSlicer.includes('cura')}
        <fieldset class="border border-gray-200 dark:border-gray-700 rounded p-4 mb-4">
          <legend class="font-semibold text-base mb-2">
            Cura
          </legend>
          <div class="space-y-4">
            <TextField
              id="cura_profile_name"
              title="Profile Name"
              description={null}
              placeholder="profiles/filament/PLA_Basic.ini"
              bind:formVar={$cura_prof}
              errorVar={$errors?.default_slicer_settings?.cura?.profile_name}
            />

            <p class="text-lg font-bold mb-2">Temperature Overrides</p>
            <div class="grid grid-cols-2 gap-4">
              <NumberField
                id="cura_first_layer_bed_temp"
                title="First Layer Bed Temp (°C)"
                description=""
                placeholder="60"
                bind:formVar={$cura_flbt}
                errorVar={$errors?.default_slicer_settings?.cura?.first_layer_bed_temp}
              />

              <NumberField
                id="cura_first_layer_nozzle_temp"
                title="First Layer Nozzle Temp (°C)"
                description=""
                placeholder="215"
                bind:formVar={$cura_flnt}
                errorVar={$errors?.default_slicer_settings?.cura?.first_layer_nozzle_temp}
              />

              <NumberField
                id="cura_bed_temp"
                title="Bed Temp (°C)"
                description=""
                placeholder="60"
                bind:formVar={$cura_bt}
                errorVar={$errors?.default_slicer_settings?.cura?.bed_temp}
              />

              <NumberField
                id="cura_nozzle_temp"
                title="Nozzle Temp (°C)"
                description=""
                placeholder="210"
                bind:formVar={$cura_nt}
                errorVar={$errors?.default_slicer_settings?.cura?.nozzle_temp}
              />
            </div>
          </div>
        </fieldset>
      {/if}
    {/key}
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