import type { Hono } from 'hono';
import { getBook, getBooks, createBook, updateBook, deleteBook } from '../db/repositories/bookRepo';
import { getBookPage, getBookPages, getNextPageNumber, createPage, deletePage } from '../db/repositories/pageRepo';
import { getImage } from '../db/repositories/imageRepo';

export function registerBookRoutes(app: Hono) {
  app.get('/api/books', (c) => {
    return c.json({ books: getBooks() });
  });

  app.post('/api/books', async (c) => {
    const payload = await c.req.json();
    const name = String(payload.name ?? '').trim();
    if (!name) return c.json({ error: 'name is required' }, 400);

    const book = getBook(createBook(name));
    return c.json({ book }, 201);
  });

  app.get('/api/books/:id', (c) => {
    const book = getBook(Number(c.req.param('id')));
    if (!book) return c.json({ error: 'book not found' }, 404);

    const pages = getBookPages(book.id);
    return c.json({ book, pages });
  });

  app.put('/api/books/:id', async (c) => {
    const id = Number(c.req.param('id'));
    if (!getBook(id)) return c.json({ error: 'book not found' }, 404);

    const payload = await c.req.json();
    const name = String(payload.name ?? '').trim();
    if (!name) return c.json({ error: 'name is required' }, 400);

    return c.json({ book: updateBook(id, name) });
  });

  app.delete('/api/books/:id', (c) => {
    const changes = deleteBook(Number(c.req.param('id')));
    if (changes === 0) return c.json({ error: 'book not found' }, 404);
    return c.json({ ok: true });
  });

  app.post('/api/books/:id/pages', async (c) => {
    const bookId = Number(c.req.param('id'));
    if (!getBook(bookId)) return c.json({ error: 'book not found' }, 404);

    const payload = await c.req.json();
    const imageId = Number(payload.imageId);
    if (!getImage(imageId)) return c.json({ error: 'image not found' }, 400);

    const pageNumber = getNextPageNumber(bookId);
    const page = getBookPage(createPage(bookId, imageId, pageNumber));
    return c.json({ page }, 201);
  });

  app.delete('/api/books/:bookId/pages/:pageId', (c) => {
    const changes = deletePage(Number(c.req.param('bookId')), Number(c.req.param('pageId')));
    if (changes === 0) return c.json({ error: 'page not found' }, 404);
    return c.json({ ok: true });
  });
}
