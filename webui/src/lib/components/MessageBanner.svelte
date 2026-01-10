<script lang="ts">
	interface Props {
		type: 'success' | 'error' | 'info';
		message: string;
	}

	let { type, message }: Props = $props();

	const styles = {
		success: 'bg-green-50 border-green-200 text-green-800',
		error: 'bg-red-50 border-red-200 text-red-800',
		info: 'bg-blue-50 border-blue-200 text-blue-800'
	};
</script>

<div class="border rounded-lg p-4 mb-6 {styles[type]}">
	<p>{message}</p>
</div>
