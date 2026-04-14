// src/lib/server/database.js
import Database from 'better-sqlite3';
const db = new Database('stories.db');

const query = `
  CREATE TABLE IF NOT EXISTS stories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_title TEXT NOT NULL,
    title TEXT NOT NULL,
    author TEXT NOT NULL,
    page_number INTEGER,
    summary TEXT,
    tags TEXT
  );
`;

db.exec(query);
export default db;