import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/public';
import { folderPassthrough } from '$lib/server/folderPassthrough';

// Path to your data directory
const DATA_DIR = env.PUBLIC_DATA_PATH;

export const GET: RequestHandler = async ({ params }) => {
  return folderPassthrough(params, DATA_DIR);
};
