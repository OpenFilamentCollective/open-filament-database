<script>
  let { children, endpoint, enhance } = $props();
</script>

<div
  class="max-w-full mx-auto bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg p-8 text-gray-900 dark:text-gray-100">
  <form
    method="POST"
    use:enhance
    action={`?/${endpoint}`}
    enctype="multipart/form-data"
    class="space-y-5">
    {@render children()}
  </form>
</div>
