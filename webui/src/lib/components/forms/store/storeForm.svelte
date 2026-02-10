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
  import { storeSchema } from '$lib/validation/store-schema';
  import ShippingList from './components/shippingList.svelte';

  type formType = 'edit' | 'create';
  let { defaultForm, formType, storeId = null, storeLogo = null } = $props();

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
    validators: zodClient(storeSchema)
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
        await realDelete('store', $form.id);
      } else {
        pseudoDelete('store', $form.id);
      }
    }
  }
</script>

<Form
  endpoint="store"
  enhance={enhance}
>
  <TextField
    id="name"
    title="Store Name"
    description='Enter the name of the storefront'
    placeholder="e.g. Bambu Lab Store"
    bind:formVar={$form.name}
    errorVar={$errors.name}
    required={true}
  />

  <TextField
    id="website"
    title="Website"
    description='Official website URL of the storefront'
    placeholder="https://www.example.com"
    bind:formVar={$form.storefront_url}
    errorVar={$errors.storefront_url}
    required={true}
  />


  <LogoUpload
    id="logo"
    title="Logo"
    bind:file={$file}
    errorVar={$errors.logo}
    required={formType === 'create'}
    currentLogo={formType === 'edit' && storeId && storeLogo ? `/stores/${storeId}/${storeLogo}` : null}
  />

  <div class="grid grid-cols-2 gap-3">
    <ShippingList
      title="Ships from"
      idPrefix="ships_from"
      bind:regions={$form.ships_from}
    />

    <ShippingList
      title="Ships to" 
      idPrefix="ships_to"
      bind:regions={$form.ships_to}
    />
  </div>

  <SubmitButton>
    {formType === 'edit' ? 'Save' : 'Create'}
  </SubmitButton>

  {#if formType === 'edit'}
    <DeleteButton handleDelete={handleDelete} />
  {/if}
</Form>