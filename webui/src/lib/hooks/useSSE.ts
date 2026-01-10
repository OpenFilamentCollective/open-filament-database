export interface SSEHandlers {
	onProgress?: (data: any) => void;
	onComplete?: (data: any) => void;
	onError?: (error: any) => void;
}

export function useSSE() {
	let eventSource: EventSource | null = null;

	function connect(url: string, handlers: SSEHandlers) {
		// Close any existing connection
		disconnect();

		eventSource = new EventSource(url);

		eventSource.onmessage = (event) => {
			try {
				const data = JSON.parse(event.data);

				if (data.type === 'progress' && handlers.onProgress) {
					handlers.onProgress(data);
				} else if (data.type === 'complete' && handlers.onComplete) {
					handlers.onComplete(data.result);
					disconnect();
				} else if (data.type === 'error' && handlers.onError) {
					handlers.onError(data);
					disconnect();
				}
			} catch (e) {
				console.error('SSE parse error:', e);
			}
		};

		eventSource.onerror = (error) => {
			console.error('SSE connection error:', error);
			handlers.onError?.(error);
			disconnect();
		};
	}

	function disconnect() {
		if (eventSource) {
			eventSource.close();
			eventSource = null;
		}
	}

	return { connect, disconnect };
}
