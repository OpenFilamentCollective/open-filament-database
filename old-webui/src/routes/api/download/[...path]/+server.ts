import type { RequestHandler } from '@sveltejs/kit';
import { prepareFilamentDownload } from '$lib/server/helpers';
import archiver from 'archiver';
import fs from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import { PassThrough } from 'stream';

export const GET: RequestHandler = async ({ params }) => {
  try {
    const relPath = typeof params.path === 'string' ? params.path.split('/') : params.path;
    const colorFolder = path.join(process.cwd(), '..', 'data', ...relPath);

    const folderExists = fs.existsSync(colorFolder);

    if (!folderExists) {
      return new Response('Folder not found', { status: 404 });
    }

    // List directory contents to verify
    const dirContents = fs.readdirSync(colorFolder);

    // Create a temp dir for zipping
    const tempDir = fs.mkdtempSync(path.join(tmpdir(), 'filament-download-'));
    await prepareFilamentDownload(colorFolder, tempDir);

    // Create archive with error handling
    const archive = archiver('zip', {
      zlib: { level: 9 }, // Maximum compression
    });
    const passthrough = new PassThrough();
    // Handle archive errors
    archive.on('error', (err) => {
      console.error('Archive error:', err);
      throw new Error(`Archive error: ${err.message}`);
    });

    // Add each file in the directory to the archive
    for (const item of dirContents) {
      const fullPath = path.join(colorFolder, item);
      const stat = fs.statSync(fullPath);

      if (stat.isFile()) {
        const fileContent = fs.readFileSync(fullPath);
        archive.append(fileContent, { name: item });
      } else if (stat.isDirectory()) {
        archive.directory(fullPath, item);
      }
    }

    // Pipe archive data to the passthrough stream
    archive.pipe(passthrough);

    // Finalize the archive
    archive.finalize();

    // Stream processing
    const chunks: Buffer[] = [];
    for await (const chunk of passthrough) {
      chunks.push(Buffer.from(chunk));
    }

    const zipData = Buffer.concat(chunks);

    // Generate filename
    const filename = `${relPath[relPath.length - 1]}.zip`;

    return new Response(zipData, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    console.error('Download error:', error);
    return new Response('Internal server error', { status: 500 });
  }
};
