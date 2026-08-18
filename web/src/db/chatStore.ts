import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import type { Source } from "../lib/server/chat";

export interface SessionSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  sources: Source[];
}

export interface SessionDetail extends SessionSummary {
  messages: ChatMessage[];
}

const defaultTitle = "New chat";

export function createSession(): SessionSummary {
  const db = getDb();
  const now = new Date().toISOString();
  const session: SessionSummary = { id: randomUUID(), title: defaultTitle, createdAt: now, updatedAt: now };

  db.prepare(
    `INSERT INTO sessions (id, title, created_at, updated_at) VALUES (@id, @title, @createdAt, @updatedAt)`
  ).run(session);

  return session;
}

export function listSessions(): SessionSummary[] {
  const db = getDb();
  const rows = db
    .prepare(`SELECT id, title, created_at AS createdAt, updated_at AS updatedAt FROM sessions ORDER BY updated_at DESC`)
    .all() as SessionSummary[];
  return rows;
}

export function getSession(sessionId: string): SessionDetail | undefined {
  const db = getDb();
  const session = db
    .prepare(`SELECT id, title, created_at AS createdAt, updated_at AS updatedAt FROM sessions WHERE id = ?`)
    .get(sessionId) as SessionSummary | undefined;

  if (!session) {
    return undefined;
  }

  const messageRows = db
    .prepare(`SELECT id, role, content, created_at AS createdAt FROM messages WHERE session_id = ? ORDER BY created_at ASC`)
    .all(sessionId) as Array<{ id: string; role: "user" | "assistant"; content: string; createdAt: string }>;

  const sourceStatement = db.prepare(
    `SELECT source_path AS sourcePath, heading_path AS headingPath FROM message_sources WHERE message_id = ? ORDER BY position ASC`
  );

  const messages: ChatMessage[] = messageRows.map((row) => ({
    ...row,
    sources: sourceStatement.all(row.id) as Source[]
  }));

  return { ...session, messages };
}

export function deleteSession(sessionId: string): void {
  const db = getDb();
  db.prepare(`DELETE FROM sessions WHERE id = ?`).run(sessionId);
}

export function addMessage(
  sessionId: string,
  role: "user" | "assistant",
  content: string,
  sources: Source[] = []
): ChatMessage {
  const db = getDb();
  const now = new Date().toISOString();
  const message: ChatMessage = { id: randomUUID(), role, content, createdAt: now, sources };

  const insertMessage = db.prepare(
    `INSERT INTO messages (id, session_id, role, content, created_at) VALUES (@id, @sessionId, @role, @content, @createdAt)`
  );
  const insertSource = db.prepare(
    `INSERT INTO message_sources (message_id, source_path, heading_path, position) VALUES (@messageId, @sourcePath, @headingPath, @position)`
  );
  const updateSession = db.prepare(`UPDATE sessions SET updated_at = @updatedAt WHERE id = @id`);
  const updateTitle = db.prepare(`UPDATE sessions SET title = @title WHERE id = @id AND title = @defaultTitle`);

  const transaction = db.transaction(() => {
    insertMessage.run({ id: message.id, sessionId, role, content, createdAt: now });
    sources.forEach((source, index) => {
      insertSource.run({ messageId: message.id, sourcePath: source.sourcePath, headingPath: source.headingPath, position: index });
    });
    updateSession.run({ id: sessionId, updatedAt: now });
    if (role === "user") {
      updateTitle.run({ id: sessionId, title: deriveTitle(content), defaultTitle });
    }
  });
  transaction();

  return message;
}

function deriveTitle(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  return trimmed.length > 60 ? `${trimmed.slice(0, 59)}…` : trimmed;
}
