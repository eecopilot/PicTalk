import type { Hono } from 'hono';
import { getSaveRecords, deleteSaveRecord, clearSaveRecordsAndRegions } from '../db/repositories/saveRecordRepo';

export function registerSaveRecordRoutes(app: Hono) {
  app.get('/api/save-records', (c) => {
    return c.json({ records: getSaveRecords() });
  });

  app.delete('/api/save-records', (c) => {
    const result = clearSaveRecordsAndRegions();
    return c.json({ ok: true, ...result });
  });

  app.delete('/api/save-records/:id', (c) => {
    const changes = deleteSaveRecord(Number(c.req.param('id')));
    if (changes === 0) return c.json({ error: 'record not found' }, 404);
    return c.json({ ok: true });
  });
}
