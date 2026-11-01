import type Database from 'better-sqlite3';
import { settingsSchema, type RetentionResult } from '@harness/contracts';
import { deleteConversationRecords } from './conversation-record';
const day = 86_400_000;
export function applyRetention(
  db: Database.Database,
  activeId: string,
): RetentionResult {
  const stored = db.prepare('SELECT data FROM settings WHERE id=1').get() as
    { data: string } | undefined;
  const settings = settingsSchema.parse(stored ? JSON.parse(stored.data) : {});
  const policy = settings.retention;
  if (!policy.enabled || (!policy.maxAgeDays && !policy.maxConversations))
    return { removed: [] };
  const preserved = new Set(
    [activeId, settings.activeConversation].filter((id): id is string => !!id),
  );
  const cutoff =
    policy.maxAgeDays == null ? null : Date.now() - policy.maxAgeDays * day;
  const rows = db
    .prepare(
      'SELECT id, updated_at FROM conversations ORDER BY updated_at DESC, id ASC',
    )
    .all() as { id: string; updated_at: number }[];
  const removed: string[] = [];
  let kept = 0;
  const remove = db.transaction((id: string) => {
    deleteConversationRecords(db, id);
    db.prepare('DELETE FROM conversations WHERE id=?').run(id);
    db.prepare('DELETE FROM conversation_drafts WHERE id=?').run(id);
  });
  for (const row of rows) {
    if (preserved.has(row.id)) {
      kept += 1;
      continue;
    }
    const overAge = cutoff != null && row.updated_at < cutoff;
    const overCount =
      policy.maxConversations != null && kept >= policy.maxConversations;
    if (overAge || overCount) {
      remove(row.id);
      removed.push(row.id);
    } else kept += 1;
  }
  return { removed };
}
