<script lang="ts">
  import { env } from '$env/dynamic/public';
  import { pseudoDelete } from '$lib/pseudoDeleter';
  import { realDelete } from '$lib/realDeleter';
  import { fileProxy } from 'sveltekit-superforms';
  import { stripOfIllegalChars } from '$lib/globalHelpers';
  import TextField from '../components/textField.svelte';
  import LogoUpload from '../components/logoUpload.svelte';
  import DeleteButton from '../components/deleteButton.svelte';
  import Form from '../components/form.svelte';
  import SubmitButton from '../components/submitButton.svelte';
  import { superForm } from 'sveltekit-superforms';
  import { zodClient } from 'sveltekit-superforms/adapters';
  import { brandSchema } from '$lib/validation/filament-brand-schema';
  import { pseudoEdit } from '$lib/pseudoEditor';

  type formType = 'edit' | 'create';
  let { defaultForm, formType } = $props();

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
    validators: zodClient(brandSchema),
    onResult: ({ result }) => {
      if (result?.type === "success") {
        if (result?.data?.data) {
          let data = JSON.parse(result.data.data);
          pseudoEdit("brand", "modified", data.id, data);
        }
      }
    }
  });
  
  const file = fileProxy(form, 'logo');

  async function handleDelete() {
    if (
      confirm(
        `Are you sure you want to delete the brand "${$form.name}"? This action cannot be undone.`,
      )
    ) {
      const isLocal = env.PUBLIC_IS_LOCAL === 'true';

      if (isLocal) {
        await realDelete('brand', $form.id);
      } else {
        pseudoDelete('brand', $form.id);
      }
    }
  }
</script>

<Form
  endpoint="brand"
  enhance={enhance}
>
  <TextField
    id="brand"
    title="Brand Name"
    description='Enter the official name of the filament manufacturer (e.g., "Prusa", "Hatchbox")'
    placeholder="e.g. Prusa"
    bind:formVar={$form.name}
    errorVar={$errors.name}
    required={true}
  />

  <TextField
    id="website"
    title="Website"
    description='Official website URL of the brand'
    placeholder="https://www.example.com"
    bind:formVar={$form.website}
    errorVar={$errors.website}
    required={true}
  />

  <TextField
    id="origin"
    title="Origin"
    description='Country or region where the brand is based'
    placeholder="e.g. US, DK"
    bind:formVar={$form.origin}
    errorVar={$errors.origin}
    required={true} 
  />

  {#if formType === 'create'}
    <LogoUpload
      id="logo"
      title="Logo"
      bind:file={$file}
      errorVar={$errors.logo}
      required={true}
    />
  {/if}

  <SubmitButton>
    {formType === 'edit' ? 'Save' : 'Create'}
  </SubmitButton>

  {#if formType === 'edit'}
    <DeleteButton handleDelete={handleDelete} />
  {/if}
</Form>