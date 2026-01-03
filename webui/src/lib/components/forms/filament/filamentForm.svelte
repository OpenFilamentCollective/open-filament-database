<script lang="ts">
  import { env } from '$env/dynamic/public';
  import { pseudoDelete } from '$lib/pseudoDeleter';
  import { realDelete } from '$lib/realDeleter';
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

  <SubmitButton>
    {formType === 'edit' ? 'Save' : 'Create'}
  </SubmitButton>  

  {#if formType === 'edit'}
    <DeleteButton
      handleDelete={handleDelete}
    />
  {/if}
</Form>
