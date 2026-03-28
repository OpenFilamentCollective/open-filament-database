<script lang="ts">
    interface Props {
        href: string;
        label?: string;
    }

    let { href, label = "Brand" }: Props = $props();
</script>


<a
    href={href}
    class="text-primary hover:text-primary/80 flex items-center gap-2 cursor-pointer"
>
    ← Back to {label}
</a>
