import { extname } from 'node:path';

export function mimeTypeFromExtension(filename: string) {
  const extension = extname(filename).toLowerCase();
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  if (extension === '.webp') return 'image/webp';
  if (extension === '.gif') return 'image/gif';
  if (extension === '.bmp') return 'image/bmp';
  return 'image/png';
}

export function safeExtension(name: string) {
  const extension = extname(name).toLowerCase();
  return ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'].includes(extension) ? extension : '.png';
}
