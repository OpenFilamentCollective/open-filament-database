<script lang="ts">
  import Fa from 'svelte-fa'
  import { faPen, faPlus, faX } from '@fortawesome/free-solid-svg-icons'
  import { page } from '$app/state';

  let dialogElement: HTMLDialogElement | null = null;
  type btnType = 'edit' | 'create';
  let { children, btnType = 'edit', spanText = '', externalStyling = ''} = $props();

  const closeDialog = $derived(page.data.flash?.type === 'success');

  $effect(() => {
    if (closeDialog && dialogElement) {
      dialogElement.close();
    }
  });
</script>

<button
  type="button"
  onclick={() => dialogElement?.showModal()}
  class={`${externalStyling || "bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-green-100 hover:text-green-700 dark:hover:bg-green-900 dark:hover:text-green-300 mb-2 rounded-lg shadow transition-colors"} flex items-center gap-2 p-2`}
  aria-label={btnType === 'edit' ? 'Edit' : 'Create'}>
  {#if btnType === 'edit'}
    <Fa icon={faPen} />
  {:else if btnType === 'create'}
    <Fa icon={faPlus} />
  {/if}
  <span class="text-sm font-medium">{spanText ? spanText : btnType === 'edit' ? 'Edit' : 'Create'}</span>
</button>

<dialog
  bind:this={dialogElement}
  class="w-full h-full bg-transparent p-4 backdrop:bg-black/40 backdrop:backdrop-blur-sm"
  style="scroll-behaviour: none;">
  <div
    class="w-full mx-auto relative bg-white dark:bg-gray-900 p-6 rounded-xl shadow-2xl text-gray-900 dark:text-gray-100">
    <button
      type="button"
      class="absolute top-0 right-0 p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
      aria-label="Close"
      onclick={() => dialogElement?.close()}>
      <Fa icon={faX} />
    </button>
    {@render children()}
  </div>
</dialog>
