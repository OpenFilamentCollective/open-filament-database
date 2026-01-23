import { vi } from 'vitest';

export interface MockResponseInit {
	ok?: boolean;
	status?: number;
	statusText?: string;
	headers?: Record<string, string>;
}

export interface MockResponse {
	ok: boolean;
	status: number;
	statusText: string;
	headers: Headers;
	json: () => Promise<unknown>;
	text: () => Promise<string>;
	clone: () => MockResponse;
}

export function createMockResponse(data: unknown, init: MockResponseInit = {}): MockResponse {
	const response: MockResponse = {
		ok: init.ok ?? true,
		status: init.status ?? 200,
		statusText: init.statusText ?? 'OK',
		headers: new Headers(init.headers),
		json: async () => data,
		text: async () => JSON.stringify(data),
		clone: () => createMockResponse(data, init)
	};
	return response;
}

export function createMockFetch(responses: Record<string, unknown | MockResponseInit & { data: unknown }>) {
	return vi.fn(async (url: string | URL, options?: RequestInit): Promise<MockResponse> => {
		const urlStr = url.toString();
		const method = options?.method || 'GET';
		const key = `${method}:${urlStr}`;

		// Try exact match first
		if (key in responses) {
			const response = responses[key];
			if (typeof response === 'object' && response !== null && 'data' in response) {
				const { data, ...init } = response as MockResponseInit & { data: unknown };
				return createMockResponse(data, init);
			}
			return createMockResponse(response);
		}

		// Try method-only match
		if (urlStr in responses) {
			const response = responses[urlStr];
			if (typeof response === 'object' && response !== null && 'data' in response) {
				const { data, ...init } = response as MockResponseInit & { data: unknown };
				return createMockResponse(data, init);
			}
			return createMockResponse(response);
		}

		// Try pattern matching
		for (const [pattern, response] of Object.entries(responses)) {
			if (pattern.includes('*')) {
				const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
				if (regex.test(key) || regex.test(urlStr)) {
					if (typeof response === 'object' && response !== null && 'data' in response) {
						const { data, ...init } = response as MockResponseInit & { data: unknown };
						return createMockResponse(data, init);
					}
					return createMockResponse(response);
				}
			}
		}

		return createMockResponse({ error: 'Not found' }, { ok: false, status: 404, statusText: 'Not Found' });
	});
}

// Helper to set up common API responses
export function setupApiMocks(mockFetch: ReturnType<typeof vi.fn>) {
	const responses: Record<string, unknown> = {};

	return {
		onGet: (url: string, data: unknown, init?: MockResponseInit) => {
			responses[`GET:${url}`] = init ? { data, ...init } : data;
			return this;
		},
		onPost: (url: string, data: unknown, init?: MockResponseInit) => {
			responses[`POST:${url}`] = init ? { data, ...init } : data;
			return this;
		},
		onPut: (url: string, data: unknown, init?: MockResponseInit) => {
			responses[`PUT:${url}`] = init ? { data, ...init } : data;
			return this;
		},
		onDelete: (url: string, data: unknown, init?: MockResponseInit) => {
			responses[`DELETE:${url}`] = init ? { data, ...init } : data;
			return this;
		},
		apply: () => {
			mockFetch.mockImplementation(createMockFetch(responses));
		}
	};
}
