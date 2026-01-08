import { json } from '@sveltejs/kit';
import fs from 'node:fs';
import path from 'node:path';
import { refreshDatabase } from '$lib/dataCacher';
import { env } from '$env/dynamic/public';

const DATA_DIR = path.resolve(env.PUBLIC_DATA_PATH);
const STORE_DIR = path.resolve(env.PUBLIC_STORES_PATH);

function deleteFolderRecursive(folderPath) {
  if (fs.existsSync(folderPath)) {
    fs.rmSync(folderPath, { recursive: true, force: true });
    return true;
  }
  return false;
}

export async function DELETE({ request }) {
  try {
    const { type, id, brandId, materialId, filamentId } = await request.json();

    let targetPath;

    switch (type) {
      case 'brand':
        targetPath = path.join(DATA_DIR, id);
        break;
      
      case 'store':
        targetPath = path.join(STORE_DIR, id);
        break;

      case 'material':
        if (!brandId) {
          return json({ error: 'Brand ID is required for material deletion' }, { status: 400 });
        }
        targetPath = path.join(DATA_DIR, brandId, id);
        break;

      case 'filament':
        if (!brandId || !materialId) {
          return json(
            { error: 'Brand ID and material ID are required for filament deletion' },
            { status: 400 },
          );
        }
        targetPath = path.join(DATA_DIR, brandId, materialId, id);
        break;

      case 'instance':
        if (!brandId || !materialId || !filamentId) {
          return json(
            {
              error:
                'Brand ID, material ID, and filament ID are required for instance deletion',
            },
            { status: 400 },
          );
        }
        targetPath = path.join(DATA_DIR, brandId, materialId, filamentId, id);
        break;

      default:
        return json(
          { error: 'Invalid type. Must be brand, material, filament, or instance' },
          { status: 400 },
        );
    }

    // Check if the path exists and is within the data directory (security check)
    if (!targetPath.startsWith(DATA_DIR) && !targetPath.startsWith(STORE_DIR)) {
      return json({ error: 'Invalid path' }, { status: 400 });
    }

    console.log(`Attemption deletion of path ${targetPath}`);

    const deleted = deleteFolderRecursive(targetPath);

    if (deleted) {
      await refreshDatabase();
      return json({ success: true, message: `${type} "${id}" deleted successfully` });
    } else {
      return json({ error: `${type} "${id}" not found` }, { status: 404 });
    }
  } catch (error) {
    console.error('Delete error:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}
