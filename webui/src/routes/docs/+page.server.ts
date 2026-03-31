import { env } from '$env/dynamic/public';
import type { PageServerLoad } from './$types';

interface ApiStats {
	brands: number;
	materials: number;
	filaments: number;
	variants: number;
	sizes: number;
	stores: number;
	purchase_links: number;
}

interface ApiIndex {
	version: string;
	generated_at: string;
	commit?: string;
	stats: ApiStats;
	endpoints: Record<string, string>;
}

export const load: PageServerLoad = async ({ fetch }) => {
	const baseUrl = env.PUBLIC_API_BASE_URL;

	if (!baseUrl) {
		return { apiData: null, baseUrl: null };
	}

	try {
		const res = await fetch(`${baseUrl}/api/v1/index.json`);
		if (!res.ok) {
			return { apiData: null, baseUrl };
		}
		const apiData: ApiIndex = await res.json();
		return { apiData, baseUrl };
	} catch {
		return { apiData: null, baseUrl };
	}
};
