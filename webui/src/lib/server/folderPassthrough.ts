import { error } from '@sveltejs/kit';
import fs from 'node:fs';
import path from 'node:path';

export const folderPassthrough = (params, directory) => {
  try {
    const filePath = typeof params.path === 'string' ? params.path : params.path?.join('/');

    if (!filePath) {
      throw error(404, 'File not found');
    }

    const fullPath = path.join(directory, filePath);

    // Security check: ensure the path is within the data directory
    const resolvedPath = path.resolve(fullPath);
    const resolvedDataDir = path.resolve(directory);

    if (!resolvedPath.startsWith(resolvedDataDir)) {
      throw error(403, 'Access denied');
    }

    // Check if file exists
    if (!fs.existsSync(fullPath)) {
      throw error(404, 'File not found');
    }

    // Check if it's actually a file (not a directory)
    const stats = fs.statSync(fullPath);
    if (!stats.isFile()) {
      throw error(404, 'Not a file');
    }

    // Read the file
    const fileBuffer = fs.readFileSync(fullPath);

    // Determine content type based on file extension
    const ext = path.extname(fullPath).toLowerCase();
    let contentType = 'application/octet-stream';

    switch (ext) {
      case '.png':
        contentType = 'image/png';
        break;
      case '.jpg':
      case '.jpeg':
        contentType = 'image/jpeg';
        break;
      case '.gif':
        contentType = 'image/gif';
        break;
      case '.svg':
        contentType = 'image/svg+xml';
        break;
      case '.json':
        contentType = 'application/json';
        break;
    }

    return new Response(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      },
    });
  } catch (err) {
    console.error('Error serving file:', err);
    throw error(500, 'Internal server error');
  }
}