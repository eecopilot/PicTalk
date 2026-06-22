import type { Hono } from 'hono';
import { buildGooglePronunciationUrl, buildTtsUrl, normalizeGoogleVariant } from '../services/ttsService';

export function registerAudioRoutes(app: Hono) {
  app.get('/api/tts', async (c) => {
    const text = c.req.query('t')?.trim();
    if (!text) return c.json({ error: 'text is required' }, 400);

    const directUrl = buildTtsUrl(text);
    let upstream: Response;
    try {
      upstream = await fetch(directUrl);
    } catch {
      return c.redirect(directUrl.toString(), 302);
    }
    if (!upstream.ok || !upstream.body) {
      return c.redirect(directUrl.toString(), 302);
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

  app.get('/api/google-pronunciation', (c) => {
    const text = c.req.query('t')?.trim();
    if (!text) return c.json({ error: 'text is required' }, 400);

    return c.json({
      audioUrl: buildGooglePronunciationUrl(text, normalizeGoogleVariant(c.req.query('variant'))).toString()
    });
  });
}
