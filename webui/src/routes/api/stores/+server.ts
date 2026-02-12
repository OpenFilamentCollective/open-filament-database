import { createListHandler } from '$lib/server/entityCrud';
import { ENTITY_CONFIGS } from '$lib/server/entityConfig';

export const GET = createListHandler(ENTITY_CONFIGS.store);
