import type { OcrRegion } from '../domain';
import { clampNumber, normalizeOcrRegion } from './ocrService';

export function validateRegionPayload(payload: any) {
  const text = String(payload.text ?? '').trim();
  const audioSource = payload.audioSource === 'google' ? 'google' : 'tts';
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
  return { text, audioSource, xPercent, yPercent, widthPercent, heightPercent, iconXPercent, iconYPercent };
}

export function normalizeImportedRegion(region: any, imageWidth: number, imageHeight: number): OcrRegion | null {
  const text = String(region.text ?? '').trim();
  if (!text || imageWidth <= 0 || imageHeight <= 0) return null;

  const hasPercent = ['xPercent', 'yPercent', 'widthPercent', 'heightPercent'].every((key) => Number.isFinite(Number(region[key])));
  if (hasPercent) {
    const xPercent = Number(region.xPercent);
    const yPercent = Number(region.yPercent);
    const widthPercent = Number(region.widthPercent);
    const heightPercent = Number(region.heightPercent);
    if (widthPercent <= 0 || heightPercent <= 0) return null;
    return {
      text,
      audioSource: region.audioSource === 'google' ? 'google' : 'tts',
      xPercent: clampNumber(xPercent, 0, 98),
      yPercent: clampNumber(yPercent, 0, 98),
      widthPercent: clampNumber(widthPercent, 4, 60),
      heightPercent: clampNumber(heightPercent, 4, 28)
    };
  }

  return normalizeOcrRegion(region, imageWidth, imageHeight);
}
