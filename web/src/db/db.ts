import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";

let db: Database.Database | undefined;

export function getDb(): Database.Database {
  if (db) {
    return db;
  }

  const dbPath = process.env.KH_DB_PATH || path.join(process.cwd(), "knowledge-hub.db");
  mkdirSync(path.dirname(dbPath), { recursive: true });

  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

function migrate(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);

    CREATE TABLE IF NOT EXISTS message_sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      source_path TEXT NOT NULL,
      heading_path TEXT NOT NULL,
      position INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_message_sources_message_id ON message_sources(message_id);
  `);
}
