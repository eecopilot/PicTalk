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

type SaveRecordRow = {
  id: number;
  image_id: number;
  image_name: string;
  region_count: number;
  created_at: string;
};

type OcrRegion = {
  text: string;
  xPercent: number;
  yPercent: number;
  widthPercent: number;
  heightPercent: number;
};

const PORT = Number(process.env.PORT ?? 8787);
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL ?? 'https://unity2.ai';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? '';
const OCR_MODEL = process.env.OCR_MODEL ?? 'gpt-5.5';
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

  CREATE TABLE IF NOT EXISTS save_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    image_id INTEGER NOT NULL,
    image_name TEXT NOT NULL,
    region_count INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE
  );
`);

const app = new Hono();
app.use('/api/*', cors());
app.use('/uploads/*', serveStatic({ root: './public' }));

app.get('/api/health', (c) => c.json({ ok: true, openaiConfigured: Boolean(OPENAI_API_KEY) }));

app.get('/api/save-records', (c) => {
  return c.json({ records: getSaveRecords() });
});

app.delete('/api/save-records', (c) => {
  db.prepare('DELETE FROM save_records').run();
  return c.json({ ok: true });
});

app.delete('/api/save-records/:id', (c) => {
  const result = db.prepare('DELETE FROM save_records WHERE id = ?').run(Number(c.req.param('id')));
  if (result.changes === 0) return c.json({ error: 'record not found' }, 404);
  return c.json({ ok: true });
});

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
  const imageBuffer = Buffer.from(await file.arrayBuffer());
  await writeFile(join(uploadDir, filename), imageBuffer);

  const result = db.prepare(`
    INSERT INTO images (filename, original_name, width, height)
    VALUES (?, ?, ?, ?)
  `).run(filename, file.name, width, height);

  const image = getImage(Number(result.lastInsertRowid));
  const regions = await detectTextRegions(imageBuffer, file.type, width, height);
  return c.json({ image, regions, ocrEnabled: Boolean(OPENAI_API_KEY) }, 201);
});

app.post('/api/images/:id/ocr', async (c) => {
  const image = getImage(Number(c.req.param('id')));
  if (!image) return c.json({ error: 'image not found' }, 404);

  const row = db.prepare('SELECT filename FROM images WHERE id = ?').get(image.id) as { filename: string } | undefined;
  if (!row) return c.json({ error: 'image file not found' }, 404);
  const filePath = join(uploadDir, row.filename);
  const imageBuffer = await readFileForOcr(filePath);
  const regions = await detectTextRegions(imageBuffer, mimeTypeFromExtension(row.filename), image.width, image.height);
  return c.json({ regions, ocrEnabled: Boolean(OPENAI_API_KEY) });
});

app.get('/api/images/:id', (c) => {
  const image = getImage(Number(c.req.param('id')));
  if (!image) return c.json({ error: 'image not found' }, 404);
  return c.json({ image, regions: getRegions(image.id) });
});

app.post('/api/images/:id/save-records', (c) => {
  const imageId = Number(c.req.param('id'));
  const image = getImage(imageId);
  if (!image) return c.json({ error: 'image not found' }, 404);

  const regionCount = Number(
    (db.prepare('SELECT COUNT(*) AS count FROM text_regions WHERE image_id = ?').get(imageId) as { count: number }).count
  );
  const recentRecord = db.prepare(`
    SELECT *
    FROM save_records
    WHERE image_id = ?
      AND region_count = ?
      AND created_at >= datetime('now', '-1 minute')
    ORDER BY id DESC
    LIMIT 1
  `).get(image.id, regionCount) as SaveRecordRow | undefined;
  if (recentRecord) {
    return c.json({ record: mapSaveRecord(recentRecord), deduped: true });
  }

  const result = db.prepare(`
    INSERT INTO save_records (image_id, image_name, region_count)
    VALUES (?, ?, ?)
  `).run(image.id, image.originalName, regionCount);

  return c.json({ record: getSaveRecord(Number(result.lastInsertRowid)) }, 201);
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

function getSaveRecord(id: number) {
  const row = db.prepare('SELECT * FROM save_records WHERE id = ?').get(id) as SaveRecordRow | undefined;
  return row ? mapSaveRecord(row) : null;
}

function getSaveRecords() {
  return (db.prepare('SELECT * FROM save_records ORDER BY id DESC LIMIT 50').all() as SaveRecordRow[]).map(mapSaveRecord);
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

function mapSaveRecord(row: SaveRecordRow) {
  return {
    id: row.id,
    imageId: row.image_id,
    imageName: row.image_name,
    regionCount: row.region_count,
    createdAt: row.created_at
  };
}

async function detectTextRegions(imageBuffer: Buffer, mimeType: string, width: number, height: number): Promise<OcrRegion[]> {
  if (!OPENAI_API_KEY) return [];

  try {
    const response = await fetch(`${OPENAI_BASE_URL.replace(/\/$/, '')}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: OCR_MODEL,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: [
              'You are an OCR engine for a picture reading app.',
              'Return only valid JSON with a regions array and no markdown.',
              'Each region must include text, x, y, width, height.',
              'Coordinates must be pixel coordinates relative to the original image.',
              'Group words into useful readable phrases when they belong together.',
              'If exact boxes are hard, estimate tight boxes around each visible phrase.',
              'Do not include decorative watermarks or irrelevant background text.'
            ].join(' ')
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Detect all readable text phrases in this image. Original image size is ${width}x${height}. Return JSON exactly like {"regions":[{"text":"hello","x":10,"y":20,"width":120,"height":40}]}. If there are speech bubbles, prioritize the text inside them.`
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${imageBuffer.toString('base64')}`
                }
              }
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      console.warn(`OCR request failed: ${response.status} ${await response.text()}`);
      return [];
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    const parsed = parseOcrJson(content);
    if (parsed.length === 0) {
      console.warn('OCR returned no regions', content);
    }
    return parsed.map((region: unknown) => normalizeOcrRegion(region, width, height)).filter((region: OcrRegion | null): region is OcrRegion => Boolean(region));
  } catch (error) {
    console.warn('OCR request failed', error);
    return [];
  }
}

async function readFileForOcr(path: string) {
  const { readFile } = await import('node:fs/promises');
  return readFile(path);
}

function mimeTypeFromExtension(filename: string) {
  const extension = extname(filename).toLowerCase();
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  if (extension === '.webp') return 'image/webp';
  if (extension === '.gif') return 'image/gif';
  if (extension === '.bmp') return 'image/bmp';
  return 'image/png';
}

function parseOcrJson(content: unknown) {
  if (typeof content !== 'string') return [];
  try {
    const parsed = JSON.parse(content);
    return Array.isArray(parsed.regions) ? parsed.regions : [];
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return [];
    try {
      const parsed = JSON.parse(match[0]);
      return Array.isArray(parsed.regions) ? parsed.regions : [];
    } catch {
      return [];
    }
  }
}

function normalizeOcrRegion(region: any, imageWidth: number, imageHeight: number): OcrRegion | null {
  const text = String(region.text ?? '').trim();
  const x = Number(region.x);
  const y = Number(region.y);
  const width = Number(region.width);
  const height = Number(region.height);
  if (!text || ![x, y, width, height].every(Number.isFinite)) return null;
  if (width <= 0 || height <= 0 || imageWidth <= 0 || imageHeight <= 0) return null;

  return {
    text,
    xPercent: clampNumber((x / imageWidth) * 100, 0, 98),
    yPercent: clampNumber((y / imageHeight) * 100, 0, 98),
    widthPercent: clampNumber((width / imageWidth) * 100, 4, 60),
    heightPercent: clampNumber((height / imageHeight) * 100, 4, 28)
  };
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
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
