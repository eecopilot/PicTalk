import { db } from '../client';
import type { SaveRecordRow } from '../types';

function mapSaveRecord(row: SaveRecordRow) {
  return {
    id: row.id,
    imageId: row.image_id,
    imageName: row.image_name,
    regionCount: row.region_count,
    createdAt: row.created_at
  };
}

export function getSaveRecord(id: number) {
  const row = db.prepare('SELECT * FROM save_records WHERE id = ?').get(id) as SaveRecordRow | undefined;
  return row ? mapSaveRecord(row) : null;
}

export function getSaveRecords() {
  return (db.prepare('SELECT * FROM save_records ORDER BY id DESC LIMIT 50').all() as SaveRecordRow[]).map(mapSaveRecord);
}

export function getSaveRecordByImage(imageId: number) {
  return db.prepare('SELECT * FROM save_records WHERE image_id = ?').get(imageId) as SaveRecordRow | undefined;
}

export function createSaveRecord(imageId: number, imageName: string, regionCount: number) {
  const result = db.prepare(`
    INSERT INTO save_records (image_id, image_name, region_count)
    VALUES (?, ?, ?)
  `).run(imageId, imageName, regionCount);
  return Number(result.lastInsertRowid);
}

export function updateSaveRecord(id: number, imageName: string, regionCount: number) {
  db.prepare(`
    UPDATE save_records
    SET image_name = ?, region_count = ?, created_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(imageName, regionCount, id);
}

export function deleteSaveRecord(id: number) {
  return db.prepare('DELETE FROM save_records WHERE id = ?').run(id).changes;
}

export function clearSaveRecordsAndRegions() {
  return db.transaction(() => {
    const recordsDeleted = db.prepare('DELETE FROM save_records').run().changes;
    const regionsDeleted = db.prepare('DELETE FROM text_regions').run().changes;
    return { recordsDeleted, regionsDeleted };
  })();
}
