import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const ssr = false;

export const load: PageLoad = ({ params }) => {
	const prNumber = Number(params.pr);
	if (!Number.isInteger(prNumber) || prNumber <= 0) error(404, 'Not a pull request number');
	return { prNumber };
};
