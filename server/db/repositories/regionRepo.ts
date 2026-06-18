import { db } from '../client';
import type { RegionRow } from '../types';
import type { OcrRegion, RegionInput } from '../../domain';

function mapRegion(row: RegionRow) {
  return {
    id: row.id,
    imageId: row.image_id,
    text: row.text,
    xPercent: row.x_percent,
    yPercent: row.y_percent,
    widthPercent: row.width_percent,
    heightPercent: row.height_percent,
    iconXPercent: row.icon_x_percent,
    iconYPercent: row.icon_y_percent,
    audioSource: row.audio_source === 'google' ? 'google' : 'tts',
    confirmed: Boolean(row.confirmed),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function getRegion(id: number) {
  const row = db.prepare('SELECT * FROM text_regions WHERE id = ?').get(id) as RegionRow | undefined;
  return row ? mapRegion(row) : null;
}

export function getRegions(imageId: number) {
  return (db.prepare('SELECT * FROM text_regions WHERE image_id = ? ORDER BY id').all(imageId) as RegionRow[]).map(mapRegion);
}

export function countRegionsByImage(imageId: number) {
  return Number(
    (db.prepare('SELECT COUNT(*) AS count FROM text_regions WHERE image_id = ?').get(imageId) as { count: number }).count
  );
}

export function deleteRegionsByImage(imageId: number) {
  return db.prepare('DELETE FROM text_regions WHERE image_id = ?').run(imageId).changes;
}

export function insertOcrRegions(imageId: number, regions: OcrRegion[]) {
  const insert = db.prepare(`
    INSERT INTO text_regions (image_id, text, x_percent, y_percent, width_percent, height_percent, audio_source, confirmed)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0)
  `);
  const ids = db.transaction((items: OcrRegion[]) =>
    items.map((region) =>
      Number(insert.run(
        imageId,
        region.text,
        region.xPercent,
        region.yPercent,
        region.widthPercent,
        region.heightPercent,
        region.audioSource === 'google' ? 'google' : 'tts'
      ).lastInsertRowid)
    )
  )(regions);
  return ids.map((id) => getRegion(id)).filter((region): region is NonNullable<ReturnType<typeof getRegion>> => Boolean(region));
}

export function insertRegion(imageId: number, region: RegionInput) {
  const result = db.prepare(`
    INSERT INTO text_regions (image_id, text, x_percent, y_percent, width_percent, height_percent, icon_x_percent, icon_y_percent, audio_source, confirmed)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).run(imageId, region.text, region.xPercent, region.yPercent, region.widthPercent, region.heightPercent, region.iconXPercent, region.iconYPercent, region.audioSource);
  return getRegion(Number(result.lastInsertRowid));
}

export function updateRegion(id: number, region: RegionInput) {
  db.prepare(`
    UPDATE text_regions
    SET text = ?, x_percent = ?, y_percent = ?, width_percent = ?, height_percent = ?, icon_x_percent = ?, icon_y_percent = ?, audio_source = ?, confirmed = 1, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(region.text, region.xPercent, region.yPercent, region.widthPercent, region.heightPercent, region.iconXPercent, region.iconYPercent, region.audioSource, id);
  return getRegion(id);
}

export function deleteRegion(id: number) {
  return db.prepare('DELETE FROM text_regions WHERE id = ?').run(id).changes;
}
