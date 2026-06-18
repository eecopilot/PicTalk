import { db } from '../client';
import type { BookPageRow } from '../types';
import { getImage } from './imageRepo';
import { getRegions } from './regionRepo';

export function getBookPage(id: number) {
  const row = db.prepare('SELECT * FROM book_pages WHERE id = ?').get(id) as BookPageRow | undefined;
  if (!row) return null;
  const image = getImage(row.image_id);
  return image ? { id: row.id, bookId: row.book_id, pageNumber: row.page_number, image, regions: getRegions(row.image_id) } : null;
}

export function getBookPages(bookId: number) {
  const rows = db.prepare('SELECT * FROM book_pages WHERE book_id = ? ORDER BY page_number').all(bookId) as BookPageRow[];
  return rows
    .map((row) => {
      const image = getImage(row.image_id);
      return image ? { id: row.id, bookId: row.book_id, pageNumber: row.page_number, image, regions: getRegions(row.image_id) } : null;
    })
    .filter((page): page is NonNullable<typeof page> => Boolean(page));
}

export function getNextPageNumber(bookId: number) {
  const maxPage = db.prepare('SELECT MAX(page_number) as max FROM book_pages WHERE book_id = ?').get(bookId) as { max: number | null };
  return (maxPage?.max ?? 0) + 1;
}

export function createPage(bookId: number, imageId: number, pageNumber: number) {
  const result = db.prepare('INSERT INTO book_pages (book_id, image_id, page_number) VALUES (?, ?, ?)').run(bookId, imageId, pageNumber);
  return Number(result.lastInsertRowid);
}

export function deletePage(bookId: number, pageId: number) {
  return db.prepare('DELETE FROM book_pages WHERE id = ? AND book_id = ?').run(pageId, bookId).changes;
}
