import { IS_CLOUD, proxyGetToCloud } from '$lib/server/cloudProxy';
import { createSchemaHandler } from '$lib/server/schemaHandler';

const handleGet = createSchemaHandler('material_types');

export const GET = async () => {
	if (IS_CLOUD) return proxyGetToCloud('/api/schemas/material_types');
	return handleGet();
};
