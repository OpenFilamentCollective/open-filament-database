import { createListHandler, createPostHandler } from '$lib/server/entityCrud';
import { ENTITY_CONFIGS } from '$lib/server/entityConfig';

const config = ENTITY_CONFIGS.material;

export const GET = createListHandler(config);
export const POST = createPostHandler(config);
