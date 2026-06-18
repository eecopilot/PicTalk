import { OPENAI_API_KEY, OPENAI_BASE_URL, OCR_MODEL } from '../config';
import type { OcrDetectionResult, OcrRegion, PixelOcrRegion } from '../domain';
import { limitText } from '../utils/text';

export async function detectTextRegions(imageBuffer: Buffer, mimeType: string, width: number, height: number): Promise<OcrDetectionResult> {
  if (!OPENAI_API_KEY) return { regions: [], error: 'ocr api key is not configured' };

  try {
    const response = await fetch(`${OPENAI_BASE_URL.replace(/\/$/, '')}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: OCR_MODEL,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: [
              'You are an OCR engine for a picture reading app.',
              'Return only valid JSON with a regions array and no markdown.',
              'Each region must include text, x, y, width, height.',
              'Coordinates must be pixel coordinates relative to the original image.',
              'Group all lines that form one sentence, question, caption, label, or speech bubble into one region.',
              'For multi-line text inside the same speech bubble, return one region with the full text in reading order.',
              'Treat visible grid cells, table cells, comic panels, worksheet boxes, cards, and bordered compartments as hard boundaries.',
              'Never merge text across a cell border, panel border, box border, or clear compartment gap, even when the text seems semantically related.',
              'If an image is arranged as many boxed cells, return one or more regions per cell, but do not create one region spanning multiple cells.',
              'For dialogue or role-play text, split by speaker turn: each A:, B:, C:, Teacher:, Student:, or similar speaker line is its own region.',
              'Keep a speaker turn together with its translation. For example "A: Don’t play with your knife/fork. 不要玩刀叉。" is one region, and "B: Don’t point chopsticks at others. 不要把筷子指向别人。" is another region.',
              'Never merge two different speaker turns into one region, even when they are inside the same table cell or speech bubble.',
              'Use spaces between joined lines unless punctuation already separates them.',
              'If exact boxes are hard, estimate one tight box around the whole phrase or sentence.',
              'Do not include decorative watermarks or irrelevant background text.'
            ].join(' ')
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Detect all readable text in this image. Original image size is ${width}x${height}. Return JSON exactly like {"regions":[{"text":"Culturally interested.","x":10,"y":20,"width":120,"height":80}]}. If text is split across multiple lines but belongs to the same sentence, question, caption, label, or speech bubble inside the same visual compartment, merge it into one region. For example, "Culturally" above "interested." in the same cell must become one region with text "Culturally interested."; "Why" above "English?" in the same bubble must become one region with text "Why English?". If the image is divided into a grid, table, comic panels, worksheet boxes, bordered cards, or separate cells, treat each cell/panel/box/card as a hard boundary and never merge text across that boundary. If a block contains dialogue labels such as A: and B:, split each speaker turn into its own region. For example, return "A: Don’t play with your knife/fork. 不要玩刀叉。" and "B: Don’t point chopsticks at others. 不要把筷子指向别人。" as two separate regions.`
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${imageBuffer.toString('base64')}`
                }
              }
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      const details = limitText(await response.text(), 500);
      console.warn(`OCR request failed: ${response.status} ${details}`);
      return { regions: [], error: `ocr request failed: ${response.status}`, details };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    const parsed = parseOcrJson(content);
    if (parsed.length === 0) {
      console.warn('OCR returned no regions', content);
      return {
        regions: [],
        error: typeof content === 'string' && content.trim() ? 'ocr returned no parsable regions' : 'ocr returned empty content',
        details: limitText(typeof content === 'string' ? content : JSON.stringify(data), 500)
      };
    }
    const regions = splitDialogueRegions(mergeNearbyOcrLines(parsed.map(toPixelOcrRegion).filter((region: PixelOcrRegion | null): region is PixelOcrRegion => Boolean(region))))
      .map((region) => normalizeOcrRegion(region, width, height))
      .filter((region: OcrRegion | null): region is OcrRegion => Boolean(region));
    if (regions.length === 0) {
      return { regions: [], error: 'ocr returned invalid region coordinates', details: limitText(JSON.stringify(parsed), 500) };
    }
    return { regions };
  } catch (error) {
    console.warn('OCR request failed', error);
    return { regions: [], error: 'ocr request failed', details: error instanceof Error ? error.message : String(error) };
  }
}

export async function readFileForOcr(path: string) {
  const { readFile } = await import('node:fs/promises');
  return readFile(path);
}

function parseOcrJson(content: unknown) {
  if (typeof content !== 'string') return [];
  try {
    const parsed = JSON.parse(content);
    return Array.isArray(parsed.regions) ? parsed.regions : [];
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return [];
    try {
      const parsed = JSON.parse(match[0]);
      return Array.isArray(parsed.regions) ? parsed.regions : [];
    } catch {
      return [];
    }
  }
}

function toPixelOcrRegion(region: any): PixelOcrRegion | null {
  const text = String(region.text ?? '').trim();
  const x = Number(region.x);
  const y = Number(region.y);
  const width = Number(region.width);
  const height = Number(region.height);
  if (!text || ![x, y, width, height].every(Number.isFinite)) return null;
  if (width <= 0 || height <= 0) return null;
  return { text, x, y, width, height };
}

function mergeNearbyOcrLines(regions: PixelOcrRegion[]) {
  const sorted = [...regions].sort((a, b) => a.y - b.y || a.x - b.x);
  const used = new Set<number>();
  const merged: PixelOcrRegion[] = [];

  for (let i = 0; i < sorted.length; i += 1) {
    if (used.has(i)) continue;
    const group = [sorted[i]];
    used.add(i);

    let expanded = true;
    while (expanded) {
      expanded = false;
      for (let j = 0; j < sorted.length; j += 1) {
        if (used.has(j)) continue;
        if (group.some((region) => shouldMergeOcrLines(region, sorted[j]))) {
          group.push(sorted[j]);
          used.add(j);
          expanded = true;
        }
      }
    }

    merged.push(mergeOcrGroup(group));
  }

  return merged;
}

function splitDialogueRegions(regions: PixelOcrRegion[]) {
  return regions.flatMap((region) => splitDialogueRegion(region));
}

function splitDialogueRegion(region: PixelOcrRegion): PixelOcrRegion[] {
  const text = region.text.replace(/\s+/g, ' ').trim();
  const matches = [...text.matchAll(/(?:^|\s)((?:[A-Z]|Teacher|Student|老师|学生|男孩|女孩|妈妈|爸爸|旁白)\s*[:：])/g)];
  if (matches.length < 2) return [region];

  const parts = matches
    .map((match, index) => {
      const start = match.index ?? 0;
      const end = index + 1 < matches.length ? matches[index + 1].index ?? text.length : text.length;
      return text.slice(start, end).trim();
    })
    .filter(Boolean);
  if (parts.length < 2) return [region];

  const partHeight = region.height / parts.length;
  return parts.map((part, index) => ({
    text: part,
    x: region.x,
    y: region.y + partHeight * index,
    width: region.width,
    height: partHeight
  }));
}

function shouldMergeOcrLines(a: PixelOcrRegion, b: PixelOcrRegion) {
  const top = a.y <= b.y ? a : b;
  const bottom = a.y <= b.y ? b : a;
  const verticalGap = bottom.y - (top.y + top.height);
  const averageHeight = (a.height + b.height) / 2;
  const centerDelta = Math.abs(centerX(a) - centerX(b));
  const maxWidth = Math.max(a.width, b.width);
  const overlap = horizontalOverlap(a, b);
  const likelyCellBoundaryGap = verticalGap > averageHeight * 0.75 && !isObviousLineContinuation(top.text, bottom.text);
  const likelySameBlock = verticalGap >= -averageHeight * 0.35 && verticalGap <= averageHeight * 0.9;
  const aligned = overlap > 0 || centerDelta <= maxWidth * 0.75;
  const samePhraseScale = Math.min(a.width, b.width) / Math.max(a.width, b.width) > 0.25;
  return !likelyCellBoundaryGap && likelySameBlock && aligned && samePhraseScale;
}

function isObviousLineContinuation(topText: string, bottomText: string) {
  const top = topText.trim();
  const bottom = bottomText.trim();
  if (!top || !bottom) return false;
  if (/[-–—/]$/.test(top)) return true;
  if (/[([{（《“"']$/.test(top)) return true;
  if (/^[a-z]/.test(bottom)) return true;
  if (/^(why|what|who|where|when|how|which|whose|can|could|do|does|did|is|are|am|will|would|should|may|might|have|has|had)$/i.test(top)) {
    return true;
  }
  return false;
}

function mergeOcrGroup(group: PixelOcrRegion[]): PixelOcrRegion {
  const ordered = [...group].sort((a, b) => a.y - b.y || a.x - b.x);
  const left = Math.min(...ordered.map((region) => region.x));
  const top = Math.min(...ordered.map((region) => region.y));
  const right = Math.max(...ordered.map((region) => region.x + region.width));
  const bottom = Math.max(...ordered.map((region) => region.y + region.height));
  return {
    sourceIds: ordered.flatMap((region) => region.sourceIds ?? (region.id ? [region.id] : [])),
    text: joinOcrText(ordered.map((region) => region.text)),
    x: left,
    y: top,
    width: right - left,
    height: bottom - top
  };
}

function joinOcrText(parts: string[]) {
  return parts
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+([,.!?;:])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function centerX(region: PixelOcrRegion) {
  return region.x + region.width / 2;
}

function horizontalOverlap(a: PixelOcrRegion, b: PixelOcrRegion) {
  return Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
}

export function normalizeOcrRegion(region: any, imageWidth: number, imageHeight: number): OcrRegion | null {
  const text = String(region.text ?? '').trim();
  const x = firstFiniteNumber(region.x, region.left, region.x1);
  const y = firstFiniteNumber(region.y, region.top, region.y1);
  const width = firstFiniteNumber(
    region.width,
    region.w,
    Number.isFinite(firstFiniteNumber(region.right, region.x2)) && Number.isFinite(x) ? firstFiniteNumber(region.right, region.x2) - x : NaN
  );
  const height = firstFiniteNumber(
    region.height,
    region.h,
    Number.isFinite(firstFiniteNumber(region.bottom, region.y2)) && Number.isFinite(y) ? firstFiniteNumber(region.bottom, region.y2) - y : NaN
  );
  if (!text || ![x, y, width, height].every(Number.isFinite)) return null;
  if (width <= 0 || height <= 0 || imageWidth <= 0 || imageHeight <= 0) return null;

  return {
    text,
    xPercent: clampNumber((x / imageWidth) * 100, 0, 98),
    yPercent: clampNumber((y / imageHeight) * 100, 0, 98),
    widthPercent: clampNumber((width / imageWidth) * 100, 4, 60),
    heightPercent: clampNumber((height / imageHeight) * 100, 4, 28)
  };
}

export function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function firstFiniteNumber(...values: unknown[]) {
  for (const value of values) {
    const numberValue = Number(value);
    if (Number.isFinite(numberValue)) return numberValue;
  }
  return NaN;
}
