export type ImageRow = {
  id: number;
  filename: string;
  original_name: string;
  content_hash: string | null;
  width: number;
  height: number;
  created_at: string;
};

export type RegionRow = {
  id: number;
  image_id: number;
  text: string;
  x_percent: number;
  y_percent: number;
  width_percent: number;
  height_percent: number;
  icon_x_percent: number | null;
  icon_y_percent: number | null;
  audio_source: 'tts' | 'google';
  confirmed: number;
  created_at: string;
  updated_at: string;
};

export type SaveRecordRow = {
  id: number;
  image_id: number;
  image_name: string;
  region_count: number;
  created_at: string;
};

export type BookRow = {
  id: number;
  name: string;
  created_at: string;
};

export type BookPageRow = {
  id: number;
  book_id: number;
  image_id: number;
  page_number: number;
  created_at: string;
};
