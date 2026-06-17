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

export function normalizeRegion(region: any): TextRegion {
  const confirmed = Boolean(region.confirmed);
  return {
    id: region.id,
    localId: String(region.id ?? crypto.randomUUID()),
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
  try {
    const parsed = JSON.parse(normalizedText);
    return Array.isArray(parsed?.regions) ? parsed : null;
  } catch {
    const match = normalizedText.match(/\{[\s\S]*"regions"[\s\S]*\}/);
    if (!match) return null;
    try {
      const parsed = JSON.parse(match[0]);
      return Array.isArray(parsed?.regions) ? parsed : null;
    } catch {
      return null;
    }
  }
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
