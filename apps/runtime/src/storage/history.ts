import type Database from 'better-sqlite3';
import {
  conversationSummarySchema,
  type ConversationSummary,
  type HistoryPageRequest,
  type HistoryPage,
} from '@harness/contracts';
interface SummaryRow {
  id: string;
  title: string;
  pinned: number;
  updated_at: number;
  project_id: string | null;
  directory_id: string | null;
  archived: number;
}
function summary(row: SummaryRow): ConversationSummary {
  return conversationSummarySchema.parse({
    id: row.id,
    title: row.title,
    pinned: Boolean(row.pinned),
    updatedAt: row.updated_at,
    projectId: row.project_id,
    directoryId: row.directory_id,
    archived: Boolean(row.archived),
  });
}
export function historyPage(
  db: Database.Database,
  request: HistoryPageRequest,
): HistoryPage {
  const clauses: string[] = [
    request.filter.kind === 'archived' ? 'archived=1' : 'archived=0',
  ];
  const parameters: (string | number)[] = [];
  if (request.filter.kind === 'general')
    clauses.push('project_id IS NULL AND directory_id IS NULL');
  if (request.filter.kind === 'project') {
    clauses.push('project_id=?');
    parameters.push(request.filter.id);
  }
  if (request.filter.kind === 'directory') {
    clauses.push('directory_id=? AND project_id IS NULL');
    parameters.push(request.filter.id);
  }
  if (request.query) {
    const like = `%${request.query.replace(/[\\%_]/g, '\\$&')}%`;
    const tokens = request.query.match(/[\p{L}\p{N}]+/gu) ?? [];
    if (tokens.length) {
      clauses.push(
        `(title LIKE ? ESCAPE '\\' OR id IN (SELECT conversation_id FROM message_records WHERE rowid IN (SELECT rowid FROM message_bodies WHERE message_bodies MATCH ?)))`,
      );
      parameters.push(
        like,
        tokens.map((token) => `"${token.replaceAll('"', '')}"`).join(' AND '),
      );
    } else {
      clauses.push("title LIKE ? ESCAPE '\\'");
      parameters.push(like);
    }
  }
  if (request.cursor) {
    const cursor = request.cursor;
    clauses.push(
      '(pinned < ? OR (pinned = ? AND updated_at < ?) OR (pinned = ? AND updated_at = ? AND id > ?))',
    );
    parameters.push(
      Number(cursor.pinned),
      Number(cursor.pinned),
      cursor.updatedAt,
      Number(cursor.pinned),
      cursor.updatedAt,
      cursor.id,
    );
  }
  const rows = db
    .prepare(
      `SELECT id, title, pinned, updated_at, project_id, directory_id, archived FROM conversations
    ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
    ORDER BY pinned DESC, updated_at DESC, id ASC LIMIT ?`,
    )
    .all(...parameters, request.limit + 1) as SummaryRow[];
  const items = rows.slice(0, request.limit).map(summary);
  const last = items.at(-1);
  return {
    items,
    nextCursor:
      rows.length > request.limit && last
        ? { id: last.id, pinned: last.pinned, updatedAt: last.updatedAt }
        : null,
  };
}
// Retained for older clients. New clients page the complete archive above.
export function legacyHistory(db: Database.Database): ConversationSummary[] {
  return (
    db
      .prepare(
        'SELECT id, title, pinned, updated_at, project_id, directory_id, archived FROM conversations ORDER BY pinned DESC, updated_at DESC, id ASC LIMIT 200',
      )
      .all() as SummaryRow[]
  ).map(summary);
}
