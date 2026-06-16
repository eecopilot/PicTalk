export type ReaderImage = {
  id: number;
  url: string;
  originalName: string;
  width: number;
  height: number;
};

export type TextRegion = {
  id?: number;
  localId: string;
  text: string;
  xPercent: number;
  yPercent: number;
  widthPercent: number;
  heightPercent: number;
  iconXPercent?: number | null;
  iconYPercent?: number | null;
  confirmed?: boolean;
  localIconReady?: boolean;
};

export type SaveRecord = {
  id: number;
  imageId: number;
  imageName: string;
  regionCount: number;
  createdAt: string;
};

export type Book = {
  id: number;
  name: string;
  createdAt: string;
};

export type BookPage = {
  id: number;
  bookId: number;
  pageNumber: number;
  image: ReaderImage;
  regions: TextRegion[];
};
