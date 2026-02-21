<script lang="ts">
    export let href: string, label: string = "Brand";
</script>


<a
    href={href}
    class="text-primary hover:text-primary/80 flex items-center gap-2 cursor-pointer"
>
    ← Back to {label}
</a>
