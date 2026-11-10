import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const schema = `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT UNIQUE NOT NULL
  );

  CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY,
    owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content_html TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS shares (
    document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (document_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS attachments (
    id INTEGER PRIMARY KEY,
    document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    mime TEXT NOT NULL,
    size INTEGER NOT NULL,
    stored_path TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;

const legacyUsernames = [
  ['alice', 'emma'],
  ['bob', 'ishmael'],
  ['carol', 'jim'],
];
const seededUsers = ['emma', 'ishmael', 'jim'];

export function createDatabase(databasePath = './data/app.db') {
  const absolutePath = resolve(databasePath);
  mkdirSync(dirname(absolutePath), { recursive: true });

  const db = new Database(absolutePath);
  db.pragma('foreign_keys = ON');
  db.exec(schema);

  const renameUser = db.prepare('UPDATE users SET username = ? WHERE username = ?');
  const insertUser = db.prepare('INSERT OR IGNORE INTO users (username) VALUES (?)');
  const seedUsers = db.transaction(() => {
    for (const [legacyUsername, username] of legacyUsernames) {
      renameUser.run(username, legacyUsername);
    }
    for (const username of seededUsers) {
      insertUser.run(username);
    }
  });
  seedUsers();

  return db;
}
