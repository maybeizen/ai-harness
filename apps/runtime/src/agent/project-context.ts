import type Database from 'better-sqlite3';
import {
  contextRecordSchema,
  projectSchema,
  type ContextRecord,
} from '@harness/contracts';
import {
  untrustedContext,
  UNTRUSTED_CONTEXT_BUDGET,
} from '../workstation/context';
export function projectInstructions(
  db: Database.Database,
  conversationId?: string,
): string {
  if (!conversationId) return '';
  const row = db
    .prepare(
      'SELECT p.data FROM conversations c JOIN projects p ON p.id=c.project_id WHERE c.id=?',
    )
    .get(conversationId) as { data: string } | undefined;
  return row ? projectSchema.parse(JSON.parse(row.data)).instructions : '';
}
function records(db: Database.Database): ContextRecord[] {
  const rows = db
    .prepare(
      'SELECT id, kind, scope, workspace_id, title, body, enabled FROM context_records ORDER BY kind, title, id',
    )
    .all() as Record<string, unknown>[];
  return rows.flatMap((row) => {
    const parsed = contextRecordSchema.safeParse({
      id: row['id'],
      kind: row['kind'],
      scope: row['scope'],
      workspaceId: row['workspace_id'],
      title: row['title'],
      body: row['body'],
      enabled: Boolean(row['enabled']),
    });
    return parsed.success ? [parsed.data] : [];
  });
}
function workspaceFor(db: Database.Database, conversationId?: string) {
  if (!conversationId) return null;
  const row = db
    .prepare('SELECT directory_id FROM conversations WHERE id=?')
    .get(conversationId) as { directory_id: string | null } | undefined;
  return row?.directory_id ?? null;
}
export function instructionContext(
  db: Database.Database,
  conversationId?: string,
  workspaceId?: string | null,
) {
  const project = projectInstructions(db, conversationId);
  const scope =
    workspaceId === undefined ? workspaceFor(db, conversationId) : workspaceId;
  const saved = records(db).filter(
    (record) =>
      record.enabled &&
      (record.scope === 'global' || record.workspaceId === scope),
  );
  const parts = [
    project,
    saved.length ? untrustedContext(saved, scope) : '',
  ].filter(Boolean);
  const text = parts.join('\n\n');
  if (text.length <= UNTRUSTED_CONTEXT_BUDGET) return text;
  return `${text.slice(0, UNTRUSTED_CONTEXT_BUDGET)}\n\nAdditional untrusted context was omitted because it exceeds the context budget.`;
}
