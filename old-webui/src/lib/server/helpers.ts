import * as fs from 'node:fs';
import * as path from 'node:path';
import { env } from '$env/dynamic/public';
import { removeUndefined } from '$lib/globalHelpers';

const DATA_DIR = env.PUBLIC_DATA_PATH;

function copyFileSync(src: string, dest: string) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

export function prepareFilamentDownload(colorFolder: string, tempDownloadDir: string) {
  for (const file of ['sizes.json', 'variant.json']) {
    const srcFile = path.join(colorFolder, file);
    if (fs.existsSync(srcFile)) {
      copyFileSync(
        srcFile,
        path.join(tempDownloadDir, path.relative('src/data', path.join(colorFolder, file))),
      );
    }
  }

  const filamentFolder = path.dirname(colorFolder);
  const filamentJson = path.join(filamentFolder, 'filament.json');
  if (fs.existsSync(filamentJson)) {
    copyFileSync(filamentJson, path.join(tempDownloadDir, path.relative('src/data', filamentJson)));
  }

  const materialFolder = path.dirname(filamentFolder);
  const materialJson = path.join(materialFolder, 'material.json');
  if (fs.existsSync(materialJson)) {
    copyFileSync(materialJson, path.join(tempDownloadDir, path.relative('src/data', materialJson)));
  }

  const brandFolder = path.dirname(materialFolder);
  const brandJson = path.join(brandFolder, 'brand.json');
  if (fs.existsSync(brandJson)) {
    copyFileSync(brandJson, path.join(tempDownloadDir, path.relative('src/data', brandJson)));
  }
}

export function downloadColor(brand: string, material: string, filament: string, color: string) {
  const url = `/api/download/${encodeURIComponent(brand)}/${encodeURIComponent(
    material,
  )}/${encodeURIComponent(filament)}/${encodeURIComponent(color)}`;

  const a = document.createElement('a');
  a.href = url;
  a.download = '';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
