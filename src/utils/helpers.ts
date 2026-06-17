import type { TextRegion, ReaderImage } from '../types';

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function roundPercent(value: number) {
  return Math.round(value * 1000) / 1000;
}

export function safeFileStem(name: string) {
  const stem = name.replace(/\.[^.]+$/, '').trim() || 'pic-reader';
  return stem.replace(/[\\/:*?"<>|]+/g, '-').slice(0, 80);
}

export function formatDate(value: string) {
  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function createLocalId() {
  if (globalThis.crypto && 'randomUUID' in globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizeRegion(region: any): TextRegion {
  const confirmed = Boolean(region.confirmed);
  return {
    id: region.id,
    localId: String(region.id ?? createLocalId()),
    text: region.text ?? '',
    xPercent: Number(region.xPercent),
    yPercent: Number(region.yPercent),
    widthPercent: Number(region.widthPercent ?? 18),
    heightPercent: Number(region.heightPercent ?? 8),
    iconXPercent: region.iconXPercent ?? null,
    iconYPercent: region.iconYPercent ?? null,
    confirmed,
    localIconReady: !region.id && Boolean(region.text)
  };
}

export async function readImageDimensions(file: File) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth || 1, height: img.naturalHeight || 1 });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('image load failed'));
    };
    img.src = url;
  });
}

export function buildManualOcrPrompt(image: ReaderImage) {
  return [
    'You are an OCR engine for a picture reading app.',
    'Detect all readable text in the attached image.',
    `Original image size is ${image.width}x${image.height}.`,
    'Return only valid JSON with a regions array and no markdown.',
    'Each region must include text, x, y, width, height.',
    'Coordinates must be pixel coordinates relative to the original image.',
    'Group all lines that form one sentence, question, caption, label, or speech bubble into one region.',
    'For multi-line text inside the same speech bubble, return one region with the full text in reading order.',
    'Treat visible grid cells, table cells, comic panels, worksheet boxes, cards, and bordered compartments as hard boundaries.',
    'Never merge text across a cell border, panel border, box border, or clear compartment gap, even when the text seems semantically related.',
    'If an image is arranged as many boxed cells, return one or more regions per cell, but do not create one region spanning multiple cells.',
    'For dialogue or role-play text, split by speaker turn: each A:, B:, C:, Teacher:, Student:, or similar speaker line is its own region.',
    'Keep a speaker turn together with its translation. For example "A: Don\'t play with your knife/fork. 不要玩刀叉。" is one region, and "B: Don\'t point chopsticks at others. 不要把筷子指向别人。" is another region.',
    'Never merge two different speaker turns into one region, even when they are inside the same table cell or speech bubble.',
    'Use spaces between joined lines unless punctuation already separates them.',
    'If exact boxes are hard, estimate one tight box around the whole phrase or sentence.',
    'Do not include decorative watermarks or irrelevant background text.',
    'Return JSON exactly like {"regions":[{"text":"Culturally interested.","x":10,"y":20,"width":120,"height":80}]}.',
    'Output JSON format only. Do not include explanations, markdown fences, or any text outside the JSON object.'
  ].join('\n');
}

export async function copyTextToClipboard(text: string) {
  if (copyTextWithSelection(text)) return;
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  throw new Error('copy failed');
}

function copyTextWithSelection(text: string) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.top = '0';
  textarea.style.left = '0';
  textarea.style.width = '1px';
  textarea.style.height = '1px';
  textarea.style.opacity = '0';
  textarea.style.pointerEvents = 'none';
  textarea.setAttribute('readonly', '');
  document.body.appendChild(textarea);
  const selection = document.getSelection();
  const previousRange = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
  textarea.focus({ preventScroll: true });
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);
  const copied = document.execCommand('copy');
  textarea.remove();
  if (previousRange && selection) {
    selection.removeAllRanges();
    selection.addRange(previousRange);
  }
  return copied;
}

export function parseImportedRegions(text: string): { regions: any[] } | null {
  const normalizedText = normalizeImportedJsonText(text);
  const looseRegions = parseLooseRegions(normalizedText);
  const candidates = uniqueTexts([
    normalizedText,
    repairMalformedRegionJson(normalizedText)
  ]);

  let bestParsed = looseRegions.length > 0 ? { regions: looseRegions } : null;
  for (const candidate of candidates) {
    const parsed = parseRegionsPayload(candidate)
      ?? parseRegionsPayload(`{${candidate}}`)
      ?? parseRegionsPayload(extractJsonObject(candidate))
      ?? parseRegionsPayload(extractJsonArray(candidate));
    if (parsed && (!bestParsed || parsed.regions.length > bestParsed.regions.length)) {
      bestParsed = parsed;
    }
  }
  return bestParsed;
}

function parseRegionsPayload(text: string | null): { regions: any[] } | null {
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    const regions = findRegionsArray(parsed);
    return regions ? { regions } : null;
  } catch {
    return null;
  }
}

function findRegionsArray(value: unknown): any[] | null {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return null;

  const objectValue = value as Record<string, unknown>;
  if (Array.isArray(objectValue.regions)) return objectValue.regions;

  for (const nestedValue of Object.values(objectValue)) {
    const regions = findRegionsArray(nestedValue);
    if (regions) return regions;
  }
  return null;
}

function extractJsonObject(text: string) {
  return extractBalancedJson(text, '{', '}');
}

function extractJsonArray(text: string) {
  return extractBalancedJson(text, '[', ']');
}

function extractBalancedJson(text: string, open: string, close: string) {
  const start = text.indexOf(open);
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === open) depth += 1;
    if (char === close) depth -= 1;
    if (depth === 0) return text.slice(start, index + 1);
  }
  return null;
}

function repairMalformedRegionJson(text: string) {
  return text
    .replace(
      /\{\s*"text"\s*:\s*"((?:\\.|[^"\\])*)"\s*,([\s\S]*?)\}\s*,\s*"width"\s*:\s*(-?\d+(?:\.\d+)?)\s*,\s*"height"\s*:\s*(-?\d+(?:\.\d+)?)\s*\}/g,
      (_match, rawText: string, body: string, width: string, height: string) => buildRepairedRegion(rawText, body, width, height)
    )
    .replace(
      /\{\s*"text"\s*:\s*"((?:\\.|[^"\\])*)"\s*,([\s\S]*?)\}\s*,\s*"height"\s*:\s*(-?\d+(?:\.\d+)?)\s*\}/g,
      (_match, rawText: string, body: string, height: string) => buildRepairedRegion(rawText, body, firstNumberForKey(body, 'width'), height)
    )
    .replace(
      /\{\s*"text"\s*:\s*"((?:\\.|[^"\\])*)"\s*,([\s\S]*?)\}\s*,\s*"width"\s*:\s*(-?\d+(?:\.\d+)?)\s*\}/g,
      (_match, rawText: string, body: string, width: string) => buildRepairedRegion(rawText, body, width, firstNumberForKey(body, 'height'))
    );
}

function parseLooseRegions(text: string) {
  const regions: any[] = [];
  const regionPattern = /\{\s*"text"\s*:\s*"((?:\\.|[^"\\])*)"\s*,([\s\S]*?)(?=,\s*\{\s*"text"\s*:|\]\s*\}?|$)/g;
  for (const match of text.matchAll(regionPattern)) {
    const rawText = match[1];
    const body = match[2];
    const x = firstNumberForKey(body, 'x');
    const y = firstNumberForKey(body, 'y');
    const width = firstNumberForKey(body, 'width');
    const height = firstNumberForKey(body, 'height');
    if (!x || !y || !width || !height) continue;
    regions.push({
      text: unescapeJsonString(rawText),
      x: Number(x),
      y: Number(y),
      width: Number(width),
      height: Number(height)
    });
  }
  return regions;
}

function unescapeJsonString(value: string) {
  try {
    return JSON.parse(`"${value}"`);
  } catch {
    return value;
  }
}

function buildRepairedRegion(rawText: string, body: string, width: string | null, height: string | null) {
  const x = firstNumberForKey(body, 'x');
  const y = firstNumberForKey(body, 'y');
  if (!x || !y || !width || !height) {
    return `{"text":"${rawText}",${body}}`;
  }
  return `{"text":"${rawText}","x":${x},"y":${y},"width":${width},"height":${height}}`;
}

function firstNumberForKey(text: string, key: string) {
  const match = new RegExp(`"${key}"\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`).exec(text);
  return match?.[1] ?? null;
}

function uniqueTexts(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function normalizeImportedJsonText(text: string) {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'");
}

export function formatOcrError(data: any, currentRegionCount: number) {
  const error = data?.error ? String(data.error) : 'ocr failed';
  const count = Array.isArray(data?.regions) ? data.regions.length : currentRegionCount;
  if (error === 'ocr returned no regions') return `重新识别失败：未识别到文字，已保留 ${count} 个标注`;
  if (error === 'ocr returned empty content') return `重新识别失败：OCR 没有返回内容，已保留 ${count} 个标注`;
  if (error === 'ocr returned no parsable regions') return `重新识别失败：OCR 返回格式不对，已保留 ${count} 个标注`;
  if (error.startsWith('ocr request failed')) return `重新识别失败：${error}，已保留 ${count} 个标注`;
  return `重新识别失败：${error}，已保留 ${count} 个标注`;
}
