import { serve } from '@hono/node-server';
import Database from 'better-sqlite3';
import 'dotenv/config';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serveStatic } from '@hono/node-server/serve-static';
import { mkdir, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

type ImageRow = {
  id: number;
  filename: string;
  original_name: string;
  width: number;
  height: number;
  created_at: string;
};

type RegionRow = {
  id: number;
  image_id: number;
  text: string;
  x_percent: number;
  y_percent: number;
  width_percent: number;
  height_percent: number;
  created_at: string;
  updated_at: string;
};

const PORT = Number(process.env.PORT ?? 8787);
const UNITY2_API_KEY = process.env.UNITY2_API_KEY ?? '';
const dataDir = join(process.cwd(), 'data');
const uploadDir = join(process.cwd(), 'public', 'uploads');
await mkdir(dataDir, { recursive: true });
await mkdir(uploadDir, { recursive: true });

const db = new Database(join(dataDir, 'pic-reader.sqlite'));
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS text_regions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    image_id INTEGER NOT NULL,
    text TEXT NOT NULL,
    x_percent REAL NOT NULL,
    y_percent REAL NOT NULL,
    width_percent REAL NOT NULL DEFAULT 18,
    height_percent REAL NOT NULL DEFAULT 8,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE
  );
`);

const app = new Hono();
app.use('/api/*', cors());
app.use('/uploads/*', serveStatic({ root: './public' }));

app.get('/api/health', (c) => c.json({ ok: true, unity2Configured: Boolean(UNITY2_API_KEY) }));

app.post('/api/images', async (c) => {
  const form = await c.req.formData();
  const file = form.get('image');
  if (!(file instanceof File) || !file.type.startsWith('image/')) {
    return c.json({ error: 'image file is required' }, 400);
  }

  const width = Number(form.get('width') ?? 0) || 1;
  const height = Number(form.get('height') ?? 0) || 1;
  const extension = safeExtension(file.name);
  const filename = `${Date.now()}-${crypto.randomUUID()}${extension}`;
  await writeFile(join(uploadDir, filename), Buffer.from(await file.arrayBuffer()));

  const result = db.prepare(`
    INSERT INTO images (filename, original_name, width, height)
    VALUES (?, ?, ?, ?)
  `).run(filename, file.name, width, height);

  const image = getImage(Number(result.lastInsertRowid));
  return c.json({ image, regions: [] }, 201);
});

app.get('/api/images/:id', (c) => {
  const image = getImage(Number(c.req.param('id')));
  if (!image) return c.json({ error: 'image not found' }, 404);
  return c.json({ image, regions: getRegions(image.id) });
});

app.post('/api/images/:id/text-regions', async (c) => {
  const imageId = Number(c.req.param('id'));
  if (!getImage(imageId)) return c.json({ error: 'image not found' }, 404);

  const payload = await c.req.json();
  const validation = validateRegionPayload(payload);
  if (validation.error) return c.json({ error: validation.error }, 400);

  const result = db.prepare(`
    INSERT INTO text_regions (image_id, text, x_percent, y_percent, width_percent, height_percent)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(imageId, validation.text, validation.xPercent, validation.yPercent, validation.widthPercent, validation.heightPercent);

  return c.json({ region: getRegion(Number(result.lastInsertRowid)) }, 201);
});

app.put('/api/text-regions/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!getRegion(id)) return c.json({ error: 'region not found' }, 404);

  const payload = await c.req.json();
  const validation = validateRegionPayload(payload);
  if (validation.error) return c.json({ error: validation.error }, 400);

  db.prepare(`
    UPDATE text_regions
    SET text = ?, x_percent = ?, y_percent = ?, width_percent = ?, height_percent = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(validation.text, validation.xPercent, validation.yPercent, validation.widthPercent, validation.heightPercent, id);

  return c.json({ region: getRegion(id) });
});

app.delete('/api/text-regions/:id', (c) => {
  const result = db.prepare('DELETE FROM text_regions WHERE id = ?').run(Number(c.req.param('id')));
  if (result.changes === 0) return c.json({ error: 'region not found' }, 404);
  return c.json({ ok: true });
});

app.post('/api/text-regions/:id/audio', (c) => {
  const region = getRegion(Number(c.req.param('id')));
  if (!region) return c.json({ error: 'region not found' }, 404);

  const url = new URL('https://tts.323686.xyz/tts');
  url.searchParams.set('t', region.text);
  url.searchParams.set('v', 'zh-CN-XiaoxiaoMultilingualNeural');
  url.searchParams.set('r', '0');
  url.searchParams.set('p', '0');
  url.searchParams.set('o', 'audio-24khz-48kbitrate-mono-mp3');
  return c.json({ audioUrl: url.toString() });
});

serve({ fetch: app.fetch, port: PORT });
console.log(`Pic Reader API running at http://localhost:${PORT}`);

function getImage(id: number) {
  const row = db.prepare('SELECT * FROM images WHERE id = ?').get(id) as ImageRow | undefined;
  if (!row) return null;
  return {
    id: row.id,
    url: `/uploads/${row.filename}`,
    originalName: row.original_name,
    width: row.width,
    height: row.height,
    createdAt: row.created_at
  };
}

function getRegion(id: number) {
  const row = db.prepare('SELECT * FROM text_regions WHERE id = ?').get(id) as RegionRow | undefined;
  return row ? mapRegion(row) : null;
}

function getRegions(imageId: number) {
  return (db.prepare('SELECT * FROM text_regions WHERE image_id = ? ORDER BY id').all(imageId) as RegionRow[]).map(mapRegion);
}

function mapRegion(row: RegionRow) {
  return {
    id: row.id,
    imageId: row.image_id,
    text: row.text,
    xPercent: row.x_percent,
    yPercent: row.y_percent,
    widthPercent: row.width_percent,
    heightPercent: row.height_percent,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function validateRegionPayload(payload: any) {
  const text = String(payload.text ?? '').trim();
  const xPercent = Number(payload.xPercent);
  const yPercent = Number(payload.yPercent);
  const widthPercent = Number(payload.widthPercent ?? 18);
  const heightPercent = Number(payload.heightPercent ?? 8);

  if (!text) return { error: 'text is required' };
  if (![xPercent, yPercent, widthPercent, heightPercent].every(Number.isFinite)) return { error: 'coordinates must be numbers' };
  if (xPercent < 0 || xPercent > 100 || yPercent < 0 || yPercent > 100) return { error: 'coordinates out of range' };
  if (widthPercent <= 0 || widthPercent > 100 || heightPercent <= 0 || heightPercent > 100) return { error: 'size out of range' };
  return { text, xPercent, yPercent, widthPercent, heightPercent };
}

function safeExtension(name: string) {
  const extension = extname(name).toLowerCase();
  return ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'].includes(extension) ? extension : '.png';
}
