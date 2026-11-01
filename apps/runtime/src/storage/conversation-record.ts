import type Database from 'better-sqlite3';
import {
  conversationSchema,
  MAX_MESSAGE_BYTES,
  type Conversation,
} from '@harness/contracts';
import { ProviderFailure } from '@harness/providers';
export function saveConversation(
  db: Database.Database,
  conversation: Conversation,
) {
  const parsed = conversationSchema.parse(conversation);
  if (parsed.messages.length > 1000)
    throw new ProviderFailure({
      code: 'CONTEXT_LIMIT',
      message:
        'This conversation has reached its message limit. Start a new chat.',
    });
  const data = JSON.stringify(parsed);
  if (Buffer.byteLength(data) > MAX_MESSAGE_BYTES - 32768)
    throw new ProviderFailure({
      code: 'CONTEXT_LIMIT',
      message:
        'This conversation has reached its storage limit. Start a new chat.',
    });
  db.prepare(
    `INSERT INTO conversations(id, updated_at, pinned, data, title, project_id, directory_id, archived, provider, model, mode)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       updated_at=excluded.updated_at,
       pinned=excluded.pinned,
       data=excluded.data,
       title=excluded.title,
       project_id=excluded.project_id,
       directory_id=excluded.directory_id,
       archived=excluded.archived,
       provider=excluded.provider,
       model=excluded.model,
       mode=excluded.mode`,
  ).run(
    parsed.id,
    parsed.updatedAt,
    Number(parsed.pinned),
    data,
    parsed.title,
    parsed.projectId ?? null,
    parsed.directoryId ?? null,
    Number(parsed.archived ?? false),
    parsed.provider ?? null,
    parsed.model ?? null,
    parsed.mode ?? null,
  );
  db.prepare('DELETE FROM message_records WHERE conversation_id = ?').run(
    parsed.id,
  );
  const insert = db.prepare(
    'INSERT INTO message_records(conversation_id, message_id, body) VALUES (?, ?, ?)',
  );
  for (const message of parsed.messages)
    insert.run(parsed.id, message.id, message.text);
}
export function deleteConversationRecords(db: Database.Database, id: string) {
  db.prepare('DELETE FROM message_records WHERE conversation_id = ?').run(id);
}
