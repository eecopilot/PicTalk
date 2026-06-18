import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { db } from './client';
import { uploadDir } from '../config';
import { md5 } from '../utils/hash';

export function migrateDatabase() {
  const imageColumns = db.prepare('PRAGMA table_info(images)').all() as { name: string }[];
  if (!imageColumns.some((column) => column.name === 'content_hash')) {
    db.prepare('ALTER TABLE images ADD COLUMN content_hash TEXT').run();
  }

  const regionColumns = db.prepare('PRAGMA table_info(text_regions)').all() as { name: string }[];
  if (!regionColumns.some((column) => column.name === 'confirmed')) {
    db.prepare('ALTER TABLE text_regions ADD COLUMN confirmed INTEGER NOT NULL DEFAULT 1').run();
    db.prepare(`
      UPDATE text_regions
      SET confirmed = 0
      WHERE image_id NOT IN (SELECT DISTINCT image_id FROM save_records)
    `).run();
  }
  if (!regionColumns.some((column) => column.name === 'icon_x_percent')) {
    db.prepare('ALTER TABLE text_regions ADD COLUMN icon_x_percent REAL').run();
  }
  if (!regionColumns.some((column) => column.name === 'icon_y_percent')) {
    db.prepare('ALTER TABLE text_regions ADD COLUMN icon_y_percent REAL').run();
  }
  if (!regionColumns.some((column) => column.name === 'audio_source')) {
    db.prepare("ALTER TABLE text_regions ADD COLUMN audio_source TEXT NOT NULL DEFAULT 'tts'").run();
  }

  const rows = db.prepare('SELECT id, filename FROM images ORDER BY id').all() as { id: number; filename: string }[];
  const groups = new Map<string, { id: number; regionCount: number }[]>();
  const countRegions = db.prepare('SELECT COUNT(*) AS count FROM text_regions WHERE image_id = ?');
  for (const row of rows) {
    const filePath = join(uploadDir, row.filename);
    if (!existsSync(filePath)) continue;
    const contentHash = md5(readFileSync(filePath));
    const regionCount = Number((countRegions.get(row.id) as { count: number }).count);
    groups.set(contentHash, [...(groups.get(contentHash) ?? []), { id: row.id, regionCount }]);
  }

  db.transaction(() => {
    db.prepare('UPDATE images SET content_hash = NULL').run();
    const update = db.prepare('UPDATE images SET content_hash = ? WHERE id = ?');
    for (const [contentHash, items] of groups) {
      const best = [...items].sort((a, b) => b.regionCount - a.regionCount || a.id - b.id)[0];
      update.run(contentHash, best.id);
    }
  })();

  db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_images_content_hash ON images(content_hash)').run();
  dedupeSaveRecords();
  db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_save_records_image_id ON save_records(image_id)').run();
}

function dedupeSaveRecords() {
  db.prepare(`
    DELETE FROM save_records
    WHERE id NOT IN (
      SELECT MAX(id)
      FROM save_records
      GROUP BY image_id
    )
  `).run();
}
