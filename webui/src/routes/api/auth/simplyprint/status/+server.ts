import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSimplyPrintToken, getSimplyPrintUser } from '$lib/server/auth';

export const GET: RequestHandler = async ({ cookies }) => {
	const token = getSimplyPrintToken(cookies);

	if (!token) {
		return json({ authenticated: false });
	}

	try {
		const user = await getSimplyPrintUser(token);
		return json({
			authenticated: true,
			user: {
				id: user.id,
				name: user.name,
				email: user.email,
				company_name: user.company_name
			}
		});
	} catch {
		cookies.delete('ofd_sp_token', { path: '/' });
		return json({ authenticated: false });
	}
};
