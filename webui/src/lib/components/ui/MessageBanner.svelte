<script lang="ts">
	interface Props {
		type: 'success' | 'error' | 'info';
		message: string;
	}

	let { type, message }: Props = $props();

	const styles = {
		success: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-950 dark:border-green-800 dark:text-green-200',
		error: 'bg-destructive/10 border-destructive/20 text-destructive',
		info: 'bg-primary/10 border-primary/20 text-primary'
	};
</script>

<div class="border rounded-lg p-4 mb-6 {styles[type]}">
	<p>{message}</p>
</div>
