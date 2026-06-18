import type { Hono } from 'hono';
import { OPENAI_API_KEY } from '../config';

export function registerHealthRoutes(app: Hono) {
  app.get('/api/health', (c) => c.json({ ok: true, openaiConfigured: Boolean(OPENAI_API_KEY) }));
}
