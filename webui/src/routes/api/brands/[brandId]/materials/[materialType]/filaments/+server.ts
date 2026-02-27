import { createListHandler, createPostHandler } from '$lib/server/entityCrud';
import { ENTITY_CONFIGS } from '$lib/server/entityConfig';

const config = ENTITY_CONFIGS.filament;

export const GET = createListHandler(config);
export const POST = createPostHandler(config);
