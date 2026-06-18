import { createHash } from 'node:crypto';

export function md5(buffer: Buffer) {
  return createHash('md5').update(buffer).digest('hex');
}
