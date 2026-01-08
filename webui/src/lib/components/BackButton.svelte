<script lang="ts">
    export let href: string, label: string = "Brand";
</script>


<a
    href={href}
    class="text-blue-600 hover:text-blue-800 flex items-center gap-2 cursor-pointer"
>
    ← Back to {label}
</a>
