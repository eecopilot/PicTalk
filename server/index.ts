import { serve } from '@hono/node-server';
import Database from 'better-sqlite3';
import 'dotenv/config';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serveStatic } from '@hono/node-server/serve-static';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { createHash } from 'node:crypto';

type ImageRow = {
  id: number;
  filename: string;
  original_name: string;
  content_hash: string | null;
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
  icon_x_percent: number | null;
  icon_y_percent: number | null;
  confirmed: number;
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

type PixelOcrRegion = {
  id?: number;
  sourceIds?: number[];
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

const PORT = Number(process.env.PORT ?? 8787);
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL ?? 'http://192.168.1.30:8317';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? 'eepisgood';
const OCR_MODEL = process.env.OCR_MODEL ?? 'gemini-3.1-pro-preview';
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
    content_hash TEXT,
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
    icon_x_percent REAL,
    icon_y_percent REAL,
    confirmed INTEGER NOT NULL DEFAULT 1,
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
migrateDatabase();

const app = new Hono();
app.use('/api/*', cors());
app.use('/uploads/*', serveStatic({ root: './public' }));
app.use('/assets/*', serveStatic({ root: './dist' }));
app.use('/logo.svg', serveStatic({ path: './dist/logo.svg' }));
app.use('/demo/*', serveStatic({ root: './dist' }));

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
  const forceOcr = form.get('forceOcr') === '1';
  const imageBuffer = Buffer.from(await file.arrayBuffer());
  const contentHash = md5(imageBuffer);
  const existingImage = getImageByHash(contentHash);
  if (existingImage && !forceOcr) {
    return c.json({
      image: existingImage,
      regions: getRegions(existingImage.id),
      ocrEnabled: Boolean(OPENAI_API_KEY),
      cached: true
    });
  }

  if (existingImage) {
    const regions = await detectTextRegions(imageBuffer, file.type, existingImage.width, existingImage.height);
    if (regions.length === 0) {
      return c.json({ error: 'ocr returned no regions', regions: getRegions(existingImage.id), ocrEnabled: Boolean(OPENAI_API_KEY) }, 502);
    }
    db.prepare('DELETE FROM text_regions WHERE image_id = ?').run(existingImage.id);
    const savedRegions = insertOcrRegions(existingImage.id, regions);
    return c.json({ image: existingImage, regions: savedRegions, ocrEnabled: Boolean(OPENAI_API_KEY), cached: false, refreshed: true });
  }

  const extension = safeExtension(file.name);
  const filename = `${Date.now()}-${crypto.randomUUID()}${extension}`;
  await writeFile(join(uploadDir, filename), imageBuffer);

  const result = db.prepare(`
    INSERT INTO images (filename, original_name, content_hash, width, height)
    VALUES (?, ?, ?, ?, ?)
  `).run(filename, file.name, contentHash, width, height);

  const image = getImage(Number(result.lastInsertRowid));
  const regions = await detectTextRegions(imageBuffer, file.type, width, height);
  const savedRegions = image ? insertOcrRegions(image.id, regions) : [];
  return c.json({ image, regions: savedRegions, ocrEnabled: Boolean(OPENAI_API_KEY), cached: false }, 201);
});

app.post('/api/images/:id/ocr', async (c) => {
  const image = getImage(Number(c.req.param('id')));
  if (!image) return c.json({ error: 'image not found' }, 404);

  const row = db.prepare('SELECT filename FROM images WHERE id = ?').get(image.id) as { filename: string } | undefined;
  if (!row) return c.json({ error: 'image file not found' }, 404);
  const filePath = join(uploadDir, row.filename);
  const imageBuffer = await readFileForOcr(filePath);
  const regions = await detectTextRegions(imageBuffer, mimeTypeFromExtension(row.filename), image.width, image.height);
  if (regions.length === 0) {
    return c.json({ error: 'ocr returned no regions', regions: getRegions(image.id), ocrEnabled: Boolean(OPENAI_API_KEY) }, 502);
  }
  db.prepare('DELETE FROM text_regions WHERE image_id = ?').run(image.id);
  const savedRegions = insertOcrRegions(image.id, regions);
  return c.json({ regions: savedRegions, ocrEnabled: Boolean(OPENAI_API_KEY) });
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
    INSERT INTO text_regions (image_id, text, x_percent, y_percent, width_percent, height_percent, icon_x_percent, icon_y_percent, confirmed)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).run(imageId, validation.text, validation.xPercent, validation.yPercent, validation.widthPercent, validation.heightPercent, validation.iconXPercent, validation.iconYPercent);

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
    SET text = ?, x_percent = ?, y_percent = ?, width_percent = ?, height_percent = ?, icon_x_percent = ?, icon_y_percent = ?, confirmed = 1, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(validation.text, validation.xPercent, validation.yPercent, validation.widthPercent, validation.heightPercent, validation.iconXPercent, validation.iconYPercent, id);

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

  return c.json({ audioUrl: buildTtsUrl(region.text).toString() });
});

app.get('/api/tts', async (c) => {
  const text = c.req.query('t')?.trim();
  if (!text) return c.json({ error: 'text is required' }, 400);

  const upstream = await fetch(buildTtsUrl(text));
  if (!upstream.ok || !upstream.body) {
    return c.json({ error: 'tts failed' }, 502);
  }

  const audio = await upstream.arrayBuffer();
  const contentType = upstream.headers.get('content-type') ?? 'audio/mpeg';
  const range = c.req.header('range');
  const headers = {
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'public, max-age=31536000, immutable',
    'Content-Type': contentType
  };

  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match) return c.body(null, 416, headers);

    const total = audio.byteLength;
    const start = match[1] ? Number(match[1]) : 0;
    const end = match[2] ? Math.min(Number(match[2]), total - 1) : total - 1;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= total) {
      return c.body(null, 416, {
        ...headers,
        'Content-Range': `bytes */${total}`
      });
    }

    const chunk = audio.slice(start, end + 1);
    return c.body(chunk, 206, {
      ...headers,
      'Content-Length': String(chunk.byteLength),
      'Content-Range': `bytes ${start}-${end}/${total}`
    });
  }

  return c.body(audio, 200, {
    ...headers,
    'Content-Length': String(audio.byteLength)
  });
});

app.get('*', serveStatic({ path: './dist/index.html' }));

serve({ fetch: app.fetch, port: PORT });
console.log(`Pic Reader API running at http://localhost:${PORT}`);

function getImage(id: number) {
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

function buildTtsUrl(text: string) {
  const url = new URL('https://tts.323686.xyz/tts');
  url.searchParams.set('t', text);
  url.searchParams.set('v', 'zh-CN-XiaoxiaoMultilingualNeural');
  url.searchParams.set('r', '0');
  url.searchParams.set('p', '0');
  url.searchParams.set('o', 'audio-24khz-48kbitrate-mono-mp3');
  return url;
}

function migrateDatabase() {
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
}

function getImageByHash(contentHash: string) {
  const row = db.prepare('SELECT * FROM images WHERE content_hash = ?').get(contentHash) as ImageRow | undefined;
  return row ? getImage(row.id) : null;
}

function getRegion(id: number) {
  const row = db.prepare('SELECT * FROM text_regions WHERE id = ?').get(id) as RegionRow | undefined;
  return row ? mapRegion(row) : null;
}

function getRegions(imageId: number) {
  return (db.prepare('SELECT * FROM text_regions WHERE image_id = ? ORDER BY id').all(imageId) as RegionRow[]).map(mapRegion);
}

function insertOcrRegions(imageId: number, regions: OcrRegion[]) {
  const insert = db.prepare(`
    INSERT INTO text_regions (image_id, text, x_percent, y_percent, width_percent, height_percent, confirmed)
    VALUES (?, ?, ?, ?, ?, ?, 0)
  `);
  const ids = db.transaction((items: OcrRegion[]) =>
    items.map((region) =>
      Number(insert.run(imageId, region.text, region.xPercent, region.yPercent, region.widthPercent, region.heightPercent).lastInsertRowid)
    )
  )(regions);
  return ids.map((id) => getRegion(id)).filter((region): region is NonNullable<ReturnType<typeof getRegion>> => Boolean(region));
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
    iconXPercent: row.icon_x_percent,
    iconYPercent: row.icon_y_percent,
    confirmed: Boolean(row.confirmed),
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
              'Group all lines that form one sentence, question, caption, label, or speech bubble into one region.',
              'For multi-line text inside the same speech bubble, return one region with the full text in reading order.',
              'For dialogue or role-play text, split by speaker turn: each A:, B:, C:, Teacher:, Student:, or similar speaker line is its own region.',
              'Keep a speaker turn together with its translation. For example "A: Don’t play with your knife/fork. 不要玩刀叉。" is one region, and "B: Don’t point chopsticks at others. 不要把筷子指向别人。" is another region.',
              'Never merge two different speaker turns into one region, even when they are inside the same table cell or speech bubble.',
              'Use spaces between joined lines unless punctuation already separates them.',
              'If exact boxes are hard, estimate one tight box around the whole phrase or sentence.',
              'Do not include decorative watermarks or irrelevant background text.'
            ].join(' ')
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Detect all readable text in this image. Original image size is ${width}x${height}. Return JSON exactly like {"regions":[{"text":"Culturally interested.","x":10,"y":20,"width":120,"height":80}]}. If text is split across multiple lines but belongs to the same sentence, question, caption, label, or speech bubble, merge it into one region. For example, "Culturally" above "interested." must become one region with text "Culturally interested."; "Why" above "English?" must become one region with text "Why English?". If a block contains dialogue labels such as A: and B:, split each speaker turn into its own region. For example, return "A: Don’t play with your knife/fork. 不要玩刀叉。" and "B: Don’t point chopsticks at others. 不要把筷子指向别人。" as two separate regions.`
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
    return splitDialogueRegions(mergeNearbyOcrLines(parsed.map(toPixelOcrRegion).filter((region: PixelOcrRegion | null): region is PixelOcrRegion => Boolean(region))))
      .map((region) => normalizeOcrRegion(region, width, height))
      .filter((region: OcrRegion | null): region is OcrRegion => Boolean(region));
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

function toPixelOcrRegion(region: any): PixelOcrRegion | null {
  const text = String(region.text ?? '').trim();
  const x = Number(region.x);
  const y = Number(region.y);
  const width = Number(region.width);
  const height = Number(region.height);
  if (!text || ![x, y, width, height].every(Number.isFinite)) return null;
  if (width <= 0 || height <= 0) return null;
  return { text, x, y, width, height };
}

function mergeNearbyOcrLines(regions: PixelOcrRegion[]) {
  const sorted = [...regions].sort((a, b) => a.y - b.y || a.x - b.x);
  const used = new Set<number>();
  const merged: PixelOcrRegion[] = [];

  for (let i = 0; i < sorted.length; i += 1) {
    if (used.has(i)) continue;
    const group = [sorted[i]];
    used.add(i);

    let expanded = true;
    while (expanded) {
      expanded = false;
      for (let j = 0; j < sorted.length; j += 1) {
        if (used.has(j)) continue;
        if (group.some((region) => shouldMergeOcrLines(region, sorted[j]))) {
          group.push(sorted[j]);
          used.add(j);
          expanded = true;
        }
      }
    }

    merged.push(mergeOcrGroup(group));
  }

  return merged;
}

function splitDialogueRegions(regions: PixelOcrRegion[]) {
  return regions.flatMap((region) => splitDialogueRegion(region));
}

function splitDialogueRegion(region: PixelOcrRegion): PixelOcrRegion[] {
  const text = region.text.replace(/\s+/g, ' ').trim();
  const matches = [...text.matchAll(/(?:^|\s)((?:[A-Z]|Teacher|Student|老师|学生|男孩|女孩|妈妈|爸爸|旁白)\s*[:：])/g)];
  if (matches.length < 2) return [region];

  const parts = matches
    .map((match, index) => {
      const start = match.index ?? 0;
      const end = index + 1 < matches.length ? matches[index + 1].index ?? text.length : text.length;
      return text.slice(start, end).trim();
    })
    .filter(Boolean);
  if (parts.length < 2) return [region];

  const partHeight = region.height / parts.length;
  return parts.map((part, index) => ({
    text: part,
    x: region.x,
    y: region.y + partHeight * index,
    width: region.width,
    height: partHeight
  }));
}

function shouldMergeOcrLines(a: PixelOcrRegion, b: PixelOcrRegion) {
  const top = a.y <= b.y ? a : b;
  const bottom = a.y <= b.y ? b : a;
  const verticalGap = bottom.y - (top.y + top.height);
  const averageHeight = (a.height + b.height) / 2;
  const centerDelta = Math.abs(centerX(a) - centerX(b));
  const maxWidth = Math.max(a.width, b.width);
  const overlap = horizontalOverlap(a, b);
  const likelySameBlock = verticalGap >= -averageHeight * 0.35 && verticalGap <= averageHeight * 1.4;
  const aligned = overlap > 0 || centerDelta <= maxWidth * 0.75;
  const samePhraseScale = Math.min(a.width, b.width) / Math.max(a.width, b.width) > 0.25;
  return likelySameBlock && aligned && samePhraseScale;
}

function mergeOcrGroup(group: PixelOcrRegion[]): PixelOcrRegion {
  const ordered = [...group].sort((a, b) => a.y - b.y || a.x - b.x);
  const left = Math.min(...ordered.map((region) => region.x));
  const top = Math.min(...ordered.map((region) => region.y));
  const right = Math.max(...ordered.map((region) => region.x + region.width));
  const bottom = Math.max(...ordered.map((region) => region.y + region.height));
  return {
    sourceIds: ordered.flatMap((region) => region.sourceIds ?? (region.id ? [region.id] : [])),
    text: joinOcrText(ordered.map((region) => region.text)),
    x: left,
    y: top,
    width: right - left,
    height: bottom - top
  };
}

function joinOcrText(parts: string[]) {
  return parts
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+([,.!?;:])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function centerX(region: PixelOcrRegion) {
  return region.x + region.width / 2;
}

function horizontalOverlap(a: PixelOcrRegion, b: PixelOcrRegion) {
  return Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
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

function md5(buffer: Buffer) {
  return createHash('md5').update(buffer).digest('hex');
}

function validateRegionPayload(payload: any) {
  const text = String(payload.text ?? '').trim();
  const xPercent = Number(payload.xPercent);
  const yPercent = Number(payload.yPercent);
  const widthPercent = Number(payload.widthPercent ?? 18);
  const heightPercent = Number(payload.heightPercent ?? 8);
  const iconXPercent = payload.iconXPercent === null || payload.iconXPercent === undefined ? null : Number(payload.iconXPercent);
  const iconYPercent = payload.iconYPercent === null || payload.iconYPercent === undefined ? null : Number(payload.iconYPercent);

  if (!text) return { error: 'text is required' };
  if (![xPercent, yPercent, widthPercent, heightPercent].every(Number.isFinite)) return { error: 'coordinates must be numbers' };
  if ((iconXPercent !== null && !Number.isFinite(iconXPercent)) || (iconYPercent !== null && !Number.isFinite(iconYPercent))) return { error: 'icon coordinates must be numbers' };
  if (xPercent < 0 || xPercent > 100 || yPercent < 0 || yPercent > 100) return { error: 'coordinates out of range' };
  if (widthPercent <= 0 || widthPercent > 100 || heightPercent <= 0 || heightPercent > 100) return { error: 'size out of range' };
  if ((iconXPercent !== null && (iconXPercent < 0 || iconXPercent > 100)) || (iconYPercent !== null && (iconYPercent < 0 || iconYPercent > 100))) return { error: 'icon coordinates out of range' };
  return { text, xPercent, yPercent, widthPercent, heightPercent, iconXPercent, iconYPercent };
}

function safeExtension(name: string) {
  const extension = extname(name).toLowerCase();
  return ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'].includes(extension) ? extension : '.png';
}
