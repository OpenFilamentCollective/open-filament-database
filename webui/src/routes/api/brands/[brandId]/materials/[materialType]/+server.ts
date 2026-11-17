import { createGetHandler, createPutHandler, createDeleteHandler } from '$lib/server/entityCrud';
import { ENTITY_CONFIGS } from '$lib/server/entityConfig';

const config = ENTITY_CONFIGS.material;

export const GET = createGetHandler(config);
export const PUT = createPutHandler(config);
export const DELETE = createDeleteHandler(config);
