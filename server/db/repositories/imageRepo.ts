import { db } from '../client';
import type { ImageRow } from '../types';

export function getImage(id: number) {
  const row = db.prepare('SELECT * FROM images WHERE id = ?').get(id) as ImageRow | undefined;
  if (!row) return null;
  return {
    id: row.id,
    url: `/uploads/${row.filename}`,
    originalName: row.original_name,
    contentHash: row.content_hash,
    width: row.width,
    height: row.height,
    createdAt: row.created_at
  };
}

export function getImageByHash(contentHash: string) {
  const row = db.prepare('SELECT * FROM images WHERE content_hash = ?').get(contentHash) as ImageRow | undefined;
  return row ? getImage(row.id) : null;
}

export function getImageFilename(id: number) {
  const row = db.prepare('SELECT filename FROM images WHERE id = ?').get(id) as { filename: string } | undefined;
  return row?.filename;
}

export function createImage(filename: string, originalName: string, contentHash: string, width: number, height: number) {
  const result = db.prepare(`
    INSERT INTO images (filename, original_name, content_hash, width, height)
    VALUES (?, ?, ?, ?, ?)
  `).run(filename, originalName, contentHash, width, height);
  return Number(result.lastInsertRowid);
}
