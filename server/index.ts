import { serve } from '@hono/node-server';
import 'dotenv/config';
import { PORT } from './config';
import './db/client';
import { migrateDatabase } from './db/migrations';
import { createApp } from './app';

migrateDatabase();

const app = createApp();
serve({ fetch: app.fetch, port: PORT });
console.log(`Pic Reader API running at http://localhost:${PORT}`);
