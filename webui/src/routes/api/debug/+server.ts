import { json, error, type RequestEvent } from '@sveltejs/kit';
import { env } from '$env/dynamic/public';
import { getServerLogs } from '$lib/server/debugLog';

export function GET({ url }: RequestEvent) {
	if (env.PUBLIC_DEBUG !== 'true') {
		throw error(404, 'Not found');
	}

	const since = url.searchParams.get('since');
	const entries = getServerLogs(since ? Number(since) : undefined);
	return json(entries);
}
