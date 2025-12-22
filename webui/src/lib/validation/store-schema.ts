import { z } from 'zod';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const MIN_DIMENSIONS = { width: 100, height: 100 };
const MAX_DIMENSIONS = { width: 400, height: 400 };

const formatBytes = (bytes: number, decimals = 2) => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
};

export const storeSchema = z.object({
  id: z.string().min(1, 'Id is required'),
  name: z.string().min(1, 'Name is required'),
  storefront_url: z
    .string()
    .url('Please enter a valid URL')
    .refine((url) => {
      return url.startsWith('http://') || url.startsWith('https://');
    }, 'URL must use HTTP or HTTPS protocol')
    .default('https://'),
  logo: z
    .instanceof(File, {
      message: 'Please upload a file.'
    })
    .refine((f) => f.size <= MAX_FILE_SIZE, {
      message: `The image is too large. Please choose an image smaller than ${formatBytes(MAX_FILE_SIZE)}.`,
    })
    .optional(),
  ships_from: z.array(z.string()).default([]).or(z.string()),
  ships_to: z.array(z.string()).default([]).or(z.string()),
  oldStoreName: z.string().optional(),
});
