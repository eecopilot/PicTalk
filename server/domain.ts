export type OcrRegion = {
  text: string;
  audioSource?: 'tts' | 'google';
  xPercent: number;
  yPercent: number;
  widthPercent: number;
  heightPercent: number;
};

export type OcrDetectionResult = {
  regions: OcrRegion[];
  error?: string;
  details?: string;
};

export type PixelOcrRegion = {
  id?: number;
  sourceIds?: number[];
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type RegionInput = {
  text: string;
  audioSource: 'tts' | 'google';
  xPercent: number;
  yPercent: number;
  widthPercent: number;
  heightPercent: number;
  iconXPercent: number | null;
  iconYPercent: number | null;
};

