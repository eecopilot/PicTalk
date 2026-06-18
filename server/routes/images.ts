import type { Hono } from 'hono';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { OPENAI_API_KEY, uploadDir } from '../config';
import { md5 } from '../utils/hash';
import { mimeTypeFromExtension, safeExtension } from '../utils/mime';
import { getImage, getImageByHash, getImageFilename, createImage } from '../db/repositories/imageRepo';
import { getRegions, deleteRegionsByImage, insertOcrRegions, countRegionsByImage } from '../db/repositories/regionRepo';
import { getSaveRecord, getSaveRecordByImage, createSaveRecord, updateSaveRecord } from '../db/repositories/saveRecordRepo';
import { detectTextRegions, readFileForOcr } from '../services/ocrService';
import { normalizeImportedRegion } from '../services/regionService';
import type { OcrRegion } from '../domain';

export function registerImageRoutes(app: Hono) {
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
      const cachedRegions = getRegions(existingImage.id);
      return c.json({
        image: existingImage,
        regions: cachedRegions,
        ocrEnabled: Boolean(OPENAI_API_KEY),
        cached: true,
        cachedRegionCount: cachedRegions.length
      });
    }

    if (existingImage) {
      const ocrResult = await detectTextRegions(imageBuffer, file.type, existingImage.width, existingImage.height);
      if (ocrResult.regions.length === 0) {
        return c.json({ error: ocrResult.error ?? 'ocr returned no regions', details: ocrResult.details, regions: getRegions(existingImage.id), ocrEnabled: Boolean(OPENAI_API_KEY) }, 502);
      }
      deleteRegionsByImage(existingImage.id);
      const savedRegions = insertOcrRegions(existingImage.id, ocrResult.regions);
      return c.json({ image: existingImage, regions: savedRegions, ocrEnabled: Boolean(OPENAI_API_KEY), cached: false, refreshed: true });
    }

    const extension = safeExtension(file.name);
    const filename = `${Date.now()}-${crypto.randomUUID()}${extension}`;
    await writeFile(join(uploadDir, filename), imageBuffer);

    const imageId = createImage(filename, file.name, contentHash, width, height);
    const image = getImage(imageId);
    const ocrResult = await detectTextRegions(imageBuffer, file.type, width, height);
    const savedRegions = image ? insertOcrRegions(image.id, ocrResult.regions) : [];
    return c.json({
      image,
      regions: savedRegions,
      ocrEnabled: Boolean(OPENAI_API_KEY),
      ocrError: ocrResult.regions.length === 0 ? ocrResult.error : undefined,
      ocrDetails: ocrResult.regions.length === 0 ? ocrResult.details : undefined,
      cached: false
    }, 201);
  });

  app.post('/api/images/:id/ocr', async (c) => {
    const image = getImage(Number(c.req.param('id')));
    if (!image) return c.json({ error: 'image not found' }, 404);

    const filename = getImageFilename(image.id);
    if (!filename) return c.json({ error: 'image file not found' }, 404);
    const filePath = join(uploadDir, filename);
    const imageBuffer = await readFileForOcr(filePath);
    const ocrResult = await detectTextRegions(imageBuffer, mimeTypeFromExtension(filename), image.width, image.height);
    if (ocrResult.regions.length === 0) {
      return c.json({ error: ocrResult.error ?? 'ocr returned no regions', details: ocrResult.details, regions: getRegions(image.id), ocrEnabled: Boolean(OPENAI_API_KEY) }, 502);
    }
    deleteRegionsByImage(image.id);
    const savedRegions = insertOcrRegions(image.id, ocrResult.regions);
    return c.json({ regions: savedRegions, ocrEnabled: Boolean(OPENAI_API_KEY) });
  });

  app.post('/api/images/:id/import-regions', async (c) => {
    const image = getImage(Number(c.req.param('id')));
    if (!image) return c.json({ error: 'image not found' }, 404);

    const payload = await c.req.json();
    const rawRegions = Array.isArray(payload?.regions) ? payload.regions : [];
    const regions = rawRegions
      .map((region: any) => normalizeImportedRegion(region, image.width, image.height))
      .filter((region: OcrRegion | null): region is OcrRegion => Boolean(region));
    if (regions.length === 0) return c.json({ error: 'no valid regions' }, 400);

    deleteRegionsByImage(image.id);
    const savedRegions = insertOcrRegions(image.id, regions);
    return c.json({ regions: savedRegions });
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

    const regionCount = countRegionsByImage(imageId);
    const existingRecord = getSaveRecordByImage(image.id);
    if (existingRecord) {
      updateSaveRecord(existingRecord.id, image.originalName, regionCount);
      return c.json({ record: getSaveRecord(existingRecord.id), updated: true });
    }

    const recordId = createSaveRecord(image.id, image.originalName, regionCount);
    return c.json({ record: getSaveRecord(recordId) }, 201);
  });
}
