import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/public';
import { folderPassthrough } from '$lib/server/folderPassthrough';

// Path to your data directory
const STORES_DIR = env.PUBLIC_STORES_PATH;

export const GET: RequestHandler = async ({ params }) => {
  return folderPassthrough(params, STORES_DIR);
};
