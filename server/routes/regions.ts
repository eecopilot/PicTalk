import type { Hono } from 'hono';
import { getImage } from '../db/repositories/imageRepo';
import { getRegion, insertRegion, updateRegion, deleteRegion } from '../db/repositories/regionRepo';
import { validateRegionPayload } from '../services/regionService';
import { buildGooglePronunciationUrl, buildTtsUrl, normalizeGoogleVariant } from '../services/ttsService';
import type { RegionInput } from '../domain';

export function registerRegionRoutes(app: Hono) {
  app.post('/api/images/:id/text-regions', async (c) => {
    const imageId = Number(c.req.param('id'));
    if (!getImage(imageId)) return c.json({ error: 'image not found' }, 404);

    const payload = await c.req.json();
    const validation = validateRegionPayload(payload);
    if (validation.error) return c.json({ error: validation.error }, 400);

    const region = insertRegion(imageId, validation as RegionInput);
    return c.json({ region }, 201);
  });

  app.put('/api/text-regions/:id', async (c) => {
    const id = Number(c.req.param('id'));
    if (!getRegion(id)) return c.json({ error: 'region not found' }, 404);

    const payload = await c.req.json();
    const validation = validateRegionPayload(payload);
    if (validation.error) return c.json({ error: validation.error }, 400);

    return c.json({ region: updateRegion(id, validation as RegionInput) });
  });

  app.delete('/api/text-regions/:id', (c) => {
    const changes = deleteRegion(Number(c.req.param('id')));
    if (changes === 0) return c.json({ error: 'region not found' }, 404);
    return c.json({ ok: true });
  });

  app.post('/api/text-regions/:id/audio', (c) => {
    const region = getRegion(Number(c.req.param('id')));
    if (!region) return c.json({ error: 'region not found' }, 404);

    const variant = normalizeGoogleVariant(c.req.query('variant'));
    const audioUrl = region.audioSource === 'google'
      ? buildGooglePronunciationUrl(region.text, variant).toString()
      : buildTtsUrl(region.text).toString();
    return c.json({ audioUrl });
  });
}
