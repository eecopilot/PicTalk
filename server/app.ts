import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serveStatic } from '@hono/node-server/serve-static';
import { registerHealthRoutes } from './routes/health';
import { registerSaveRecordRoutes } from './routes/saveRecords';
import { registerBookRoutes } from './routes/books';
import { registerImageRoutes } from './routes/images';
import { registerRegionRoutes } from './routes/regions';
import { registerAudioRoutes } from './routes/audio';

export function createApp() {
  const app = new Hono();
  app.use('/api/*', cors());
  app.use('/uploads/*', serveStatic({ root: './public' }));
  app.use('/assets/*', serveStatic({ root: './dist' }));
  app.use('/logo.svg', serveStatic({ path: './dist/logo.svg' }));
  app.use('/demo/*', serveStatic({ root: './dist' }));

  registerHealthRoutes(app);
  registerSaveRecordRoutes(app);
  registerBookRoutes(app);
  registerImageRoutes(app);
  registerRegionRoutes(app);
  registerAudioRoutes(app);

  app.get('*', serveStatic({ path: './dist/index.html' }));

  return app;
}
