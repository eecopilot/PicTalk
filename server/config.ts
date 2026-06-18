import { join } from 'node:path';

export const PORT = Number(process.env.PORT ?? 8787);
export const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL ?? 'http://192.168.1.30:8317';
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? 'eepisgood';
export const OCR_MODEL = process.env.OCR_MODEL ?? 'gemini-3.1-pro-preview';
export const dataDir = join(process.cwd(), 'data');
export const uploadDir = join(process.cwd(), 'public', 'uploads');
