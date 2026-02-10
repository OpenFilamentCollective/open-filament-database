<script lang="ts">
  import { env } from '$env/dynamic/public';
  import { pseudoDelete } from '$lib/pseudoDeleter';
  import { realDelete } from '$lib/realDeleter';
  import { intProxy, stringProxy } from 'sveltekit-superforms';
  import DeleteButton from '../components/deleteButton.svelte';
  import BigCheck from '../components/bigCheck.svelte';
  import Form from '../components/form.svelte';
  import NumberField from '../components/numberField.svelte';
  import SubmitButton from '../components/submitButton.svelte';
  import TextField from '../components/textField.svelte';
  import { superForm } from 'sveltekit-superforms';
  import { zodClient } from 'sveltekit-superforms/adapters';
  import { filamentSchema } from '$lib/validation/filament-schema';

  type formType = 'edit' | 'create';
  let { defaultForm, formType: formType, brandId, materialId } = $props();

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
    validators: zodClient(filamentSchema)
  });

  async function handleDelete() {
    if (
      confirm(
        `Are you sure you want to delete the filament "${$form.name}"? This action cannot be undone.`,
      )
    ) {
      const isLocal = env.PUBLIC_IS_LOCAL === 'true';

      if (isLocal) {
        await realDelete('filament', $form.id, brandId, materialId);
      } else {
        pseudoDelete('filament', $form.id, brandId, materialId);
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

    if ($form?.slicer_settings?.[key]) {
      Object.values($form?.slicer_settings?.[key]).forEach(element => {
        if (element && !selectedSlicer.includes(key)) {
          selectedSlicer.push(key);
        }
      });
    }
  });

  function handleSlicerToggle(key: string) {
    if (!selectedSlicer.includes(key) && $form.slicer_settings?.[key]) {
      $form.slicer_settings[key] = {};
    }
  }

  // Proxies for nested slicer_settings properties
  const generic_flbt = intProxy(form, 'slicer_settings.generic.first_layer_bed_temp');
  const generic_flnt = intProxy(form, 'slicer_settings.generic.first_layer_nozzle_temp');
  const generic_bt = intProxy(form, 'slicer_settings.generic.bed_temp');
  const generic_nt = intProxy(form, 'slicer_settings.generic.nozzle_temp');

  const prusa_prof = stringProxy(
    form,
    "slicer_settings.prusaslicer.profile_name",
    { empty: "undefined" }
  );
  const prusa_flbt = intProxy(form, 'slicer_settings.prusaslicer.first_layer_bed_temp');
  const prusa_flnt = intProxy(form, 'slicer_settings.prusaslicer.first_layer_nozzle_temp');
  const prusa_bt = intProxy(form, 'slicer_settings.prusaslicer.bed_temp');
  const prusa_nt = intProxy(form, 'slicer_settings.prusaslicer.nozzle_temp');

  const bambu_prof = stringProxy(
    form,
    "slicer_settings.bambustudio.profile_name",
    { empty: "undefined" }
  );
  const bambu_flbt = intProxy(form, 'slicer_settings.bambustudio.first_layer_bed_temp');
  const bambu_flnt = intProxy(form, 'slicer_settings.bambustudio.first_layer_nozzle_temp');
  const bambu_bt = intProxy(form, 'slicer_settings.bambustudio.bed_temp');
  const bambu_nt = intProxy(form, 'slicer_settings.bambustudio.nozzle_temp');

  const orca_prof = stringProxy(
    form,
    "slicer_settings.orcaslicer.profile_name",
    { empty: "undefined" }
  );
  const orca_flbt = intProxy(form, 'slicer_settings.orcaslicer.first_layer_bed_temp');
  const orca_flnt = intProxy(form, 'slicer_settings.orcaslicer.first_layer_nozzle_temp');
  const orca_bt = intProxy(form, 'slicer_settings.orcaslicer.bed_temp');
  const orca_nt = intProxy(form, 'slicer_settings.orcaslicer.nozzle_temp');

  const cura_prof = stringProxy(
    form,
    "slicer_settings.cura.profile_name",
    { empty: "undefined" }
  );
  const cura_flbt = intProxy(form, 'slicer_settings.cura.first_layer_bed_temp');
  const cura_flnt = intProxy(form, 'slicer_settings.cura.first_layer_nozzle_temp');
  const cura_bt = intProxy(form, 'slicer_settings.cura.bed_temp');
  const cura_nt = intProxy(form, 'slicer_settings.cura.nozzle_temp');
</script>

<Form
  endpoint="filament"
  enhance={enhance}
>
  <TextField
    id="name"
    title="Filament name"
    description='Enter the specific name or type of this filament material (e.g., "PLA+", "PETG", "ABS Pro")'
    placeholder="e.g. PLA+"
    bind:formVar={$form.name}
    errorVar={$errors.name}
    required={true}
  />

  <NumberField
    id="diameter_tolerance"
    title="Diameter tolerance"
    description='Acceptable variation in filament diameter (typically ±0.02mm or ±0.03mm)'
    placeholder="e.g. 0.02"
    bind:formVar={$form.diameter_tolerance}
    errorVar={$errors.diameter_tolerance}
    required={true}
  />

  <NumberField
    id="density"
    title="Density"
    description='Material density in grams per cubic centimeter (g/cm³)'
    placeholder="e.g. 1.24"
    bind:formVar={$form.density}
    errorVar={$errors.density}
    required={true}
  />

  <NumberField
    id="max_dry_temperature"
    title="Max Dry Temperature"
    description='Maximum drying temperature (typically somewhere around 55-65°C)'
    placeholder="e.g. 55"
    bind:formVar={$form.max_dry_temperature}
    errorVar={$errors.max_dry_temperature}
  />

  <BigCheck
    bind:formVar={$form.discontinued}
    errorVar={$errors.discontinued}
    description="Select if this filament is discontinued"
  />

  <TextField
    id="data_sheet_url"
    title="Data sheet URL"
    description='Link to technical data sheet with material specifications'
    placeholder="https://www.example.com/datasheet.pdf"
    bind:formVar={$form.data_sheet_url}
    errorVar={$errors.data_sheet_url}
  />

  <TextField
    id="safety_sheet_url"
    title="Safety sheet URL"
    description='Link to Material Safety Data Sheet (MSDS) for handling and safety information'
    placeholder="https://www.example.com/msds.pdf"
    bind:formVar={$form.safety_sheet_url}
    errorVar={$errors.safety_sheet_url}
  />

  <div class="slicerSettings space-y-4">
    <p class="block font-medium mb-1">Slicer Settings</p>
    <p class="text-sm text-gray-600 dark:text-gray-400 mb-2">
      Override material-level slicer settings for this specific filament.
    </p>

    <div class="flex flex-wrap gap-4 mb-4">
      {#each slicerOptions as option}
        <label class="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            value={option.key}
            bind:group={selectedSlicer}
            onchange={() => handleSlicerToggle(option.key)}
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
                id="fil_generic_first_layer_bed_temp"
                title="First Layer Bed Temp (°C)"
                description=""
                placeholder="60"
                bind:formVar={$generic_flbt}
                errorVar={$errors?.slicer_settings?.generic?.first_layer_bed_temp}
              />

              <NumberField
                id="fil_generic_first_layer_nozzle_temp"
                title="First Layer Nozzle Temp (°C)"
                description=""
                placeholder="215"
                bind:formVar={$generic_flnt}
                errorVar={$errors?.slicer_settings?.generic?.first_layer_nozzle_temp}
              />

              <NumberField
                id="fil_generic_bed_temp"
                title="Bed Temp (°C)"
                description=""
                placeholder="60"
                bind:formVar={$generic_bt}
                errorVar={$errors?.slicer_settings?.generic?.bed_temp}
              />

              <NumberField
                id="fil_generic_nozzle_temp"
                title="Nozzle Temp (°C)"
                description=""
                placeholder="210"
                bind:formVar={$generic_nt}
                errorVar={$errors?.slicer_settings?.generic?.nozzle_temp}
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
              id="fil_prusa_profile_name"
              title="Profile Name"
              description={null}
              placeholder="profiles/filament/PLA_Basic.ini"
              bind:formVar={$prusa_prof}
              errorVar={$errors?.slicer_settings?.prusaslicer?.profile_name}
            />

            <p class="text-lg font-bold mb-2">Temperature Overrides</p>
            <div class="grid grid-cols-2 gap-4">
              <NumberField
                id="fil_prusa_first_layer_bed_temp"
                title="First Layer Bed Temp (°C)"
                description=""
                placeholder="60"
                bind:formVar={$prusa_flbt}
                errorVar={$errors?.slicer_settings?.prusaslicer?.first_layer_bed_temp}
              />

              <NumberField
                id="fil_prusa_first_layer_nozzle_temp"
                title="First Layer Nozzle Temp (°C)"
                description=""
                placeholder="215"
                bind:formVar={$prusa_flnt}
                errorVar={$errors?.slicer_settings?.prusaslicer?.first_layer_nozzle_temp}
              />

              <NumberField
                id="fil_prusa_bed_temp"
                title="Bed Temp (°C)"
                description=""
                placeholder="60"
                bind:formVar={$prusa_bt}
                errorVar={$errors?.slicer_settings?.prusaslicer?.bed_temp}
              />

              <NumberField
                id="fil_prusa_nozzle_temp"
                title="Nozzle Temp (°C)"
                description=""
                placeholder="210"
                bind:formVar={$prusa_nt}
                errorVar={$errors?.slicer_settings?.prusaslicer?.nozzle_temp}
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
              id="fil_bambu_profile_name"
              title="Profile Name"
              description={null}
              placeholder="profiles/filament/PLA_Basic.ini"
              bind:formVar={$bambu_prof}
              errorVar={$errors?.slicer_settings?.bambustudio?.profile_name}
            />

            <p class="text-lg font-bold mb-2">Temperature Overrides</p>
            <div class="grid grid-cols-2 gap-4">
              <NumberField
                id="fil_bambu_first_layer_bed_temp"
                title="First Layer Bed Temp (°C)"
                description=""
                placeholder="60"
                bind:formVar={$bambu_flbt}
                errorVar={$errors?.slicer_settings?.bambustudio?.first_layer_bed_temp}
              />

              <NumberField
                id="fil_bambu_first_layer_nozzle_temp"
                title="First Layer Nozzle Temp (°C)"
                description=""
                placeholder="215"
                bind:formVar={$bambu_flnt}
                errorVar={$errors?.slicer_settings?.bambustudio?.first_layer_nozzle_temp}
              />

              <NumberField
                id="fil_bambu_bed_temp"
                title="Bed Temp (°C)"
                description=""
                placeholder="60"
                bind:formVar={$bambu_bt}
                errorVar={$errors?.slicer_settings?.bambustudio?.bed_temp}
              />

              <NumberField
                id="fil_bambu_nozzle_temp"
                title="Nozzle Temp (°C)"
                description=""
                placeholder="210"
                bind:formVar={$bambu_nt}
                errorVar={$errors?.slicer_settings?.bambustudio?.nozzle_temp}
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
              id="fil_orca_profile_name"
              title="Profile Name"
              description={null}
              placeholder="profiles/filament/PLA_Basic.ini"
              bind:formVar={$orca_prof}
              errorVar={$errors?.slicer_settings?.orcaslicer?.profile_name}
            />

            <p class="text-lg font-bold mb-2">Temperature Overrides</p>
            <div class="grid grid-cols-2 gap-4">
              <NumberField
                id="fil_orca_first_layer_bed_temp"
                title="First Layer Bed Temp (°C)"
                description=""
                placeholder="60"
                bind:formVar={$orca_flbt}
                errorVar={$errors?.slicer_settings?.orcaslicer?.first_layer_bed_temp}
              />

              <NumberField
                id="fil_orca_first_layer_nozzle_temp"
                title="First Layer Nozzle Temp (°C)"
                description=""
                placeholder="215"
                bind:formVar={$orca_flnt}
                errorVar={$errors?.slicer_settings?.orcaslicer?.first_layer_nozzle_temp}
              />

              <NumberField
                id="fil_orca_bed_temp"
                title="Bed Temp (°C)"
                description=""
                placeholder="60"
                bind:formVar={$orca_bt}
                errorVar={$errors?.slicer_settings?.orcaslicer?.bed_temp}
              />

              <NumberField
                id="fil_orca_nozzle_temp"
                title="Nozzle Temp (°C)"
                description=""
                placeholder="210"
                bind:formVar={$orca_nt}
                errorVar={$errors?.slicer_settings?.orcaslicer?.nozzle_temp}
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
              id="fil_cura_profile_name"
              title="Profile Name"
              description={null}
              placeholder="profiles/filament/PLA_Basic.ini"
              bind:formVar={$cura_prof}
              errorVar={$errors?.slicer_settings?.cura?.profile_name}
            />

            <p class="text-lg font-bold mb-2">Temperature Overrides</p>
            <div class="grid grid-cols-2 gap-4">
              <NumberField
                id="fil_cura_first_layer_bed_temp"
                title="First Layer Bed Temp (°C)"
                description=""
                placeholder="60"
                bind:formVar={$cura_flbt}
                errorVar={$errors?.slicer_settings?.cura?.first_layer_bed_temp}
              />

              <NumberField
                id="fil_cura_first_layer_nozzle_temp"
                title="First Layer Nozzle Temp (°C)"
                description=""
                placeholder="215"
                bind:formVar={$cura_flnt}
                errorVar={$errors?.slicer_settings?.cura?.first_layer_nozzle_temp}
              />

              <NumberField
                id="fil_cura_bed_temp"
                title="Bed Temp (°C)"
                description=""
                placeholder="60"
                bind:formVar={$cura_bt}
                errorVar={$errors?.slicer_settings?.cura?.bed_temp}
              />

              <NumberField
                id="fil_cura_nozzle_temp"
                title="Nozzle Temp (°C)"
                description=""
                placeholder="210"
                bind:formVar={$cura_nt}
                errorVar={$errors?.slicer_settings?.cura?.nozzle_temp}
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
