import { activeJobs } from '$lib/server/jobManager';

export async function GET({ params }) {
	const { jobId } = params;
	const job = activeJobs.get(jobId);

	if (!job) {
		return new Response('Job not found', { status: 404 });
	}

	let intervalHandle: NodeJS.Timeout | null = null;

	const stream = new ReadableStream({
		start(controller) {
			let eventIndex = 0;

			const encoder = new TextEncoder();

			const sendEvent = (data: any) => {
				const message = `data: ${JSON.stringify(data)}\n\n`;
				controller.enqueue(encoder.encode(message));
			};

			// Send already emitted events
			for (let i = eventIndex; i < job.events.length; i++) {
				sendEvent(job.events[i]);
			}
			eventIndex = job.events.length;

			// Check if already complete
			if (job.status === 'complete' || job.status === 'error') {
				controller.close();
				return;
			}

			// Poll for new events
			intervalHandle = setInterval(() => {
				// Send new events
				for (let i = eventIndex; i < job.events.length; i++) {
					sendEvent(job.events[i]);
				}
				eventIndex = job.events.length;

				// Check if complete
				if (job.status === 'complete' || job.status === 'error') {
					if (intervalHandle) {
						clearInterval(intervalHandle);
						intervalHandle = null;
					}
					controller.close();
				}
			}, 100); // Poll every 100ms
		},
		cancel() {
			if (intervalHandle) {
				clearInterval(intervalHandle);
				intervalHandle = null;
			}
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive'
		}
	});
}
