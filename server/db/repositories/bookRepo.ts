import { db } from '../client';
import type { BookRow } from '../types';

function mapBook(row: BookRow) {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at
  };
}

export function getBook(id: number) {
  const row = db.prepare('SELECT * FROM books WHERE id = ?').get(id) as BookRow | undefined;
  return row ? mapBook(row) : null;
}

export function getBooks() {
  return (db.prepare('SELECT * FROM books ORDER BY id DESC').all() as BookRow[]).map(mapBook);
}

export function createBook(name: string) {
  const result = db.prepare('INSERT INTO books (name) VALUES (?)').run(name);
  return Number(result.lastInsertRowid);
}

export function updateBook(id: number, name: string) {
  db.prepare('UPDATE books SET name = ? WHERE id = ?').run(name, id);
  return getBook(id);
}

export function deleteBook(id: number) {
  return db.prepare('DELETE FROM books WHERE id = ?').run(id).changes;
}
