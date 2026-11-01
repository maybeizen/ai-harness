import type Database from 'better-sqlite3';
import {
  attachmentReadSchema,
  conversationFileSchema,
  type ConversationFile,
  type StorageOperation,
} from '@harness/contracts';
import { ProviderFailure } from '@harness/providers';
import {
  attachmentMeta,
  providerMessages,
  readAttachment,
  rememberAttachments,
  writeAttachment,
} from './attachments';
import { saveConversation } from './conversation-record';
import { applyRetention } from './retention';
export function importConversation(
  db: Database.Database,
  file: ConversationFile,
) {
  const parsed = conversationFileSchema.parse(file);
  const existing = db
    .prepare('SELECT id FROM conversations WHERE id=?')
    .get(parsed.conversation.id);
  if (existing)
    throw new ProviderFailure({
      code: 'INVALID_REQUEST',
      message: 'This conversation is already stored on this device.',
    });
  saveConversation(db, parsed.conversation);
  rememberAttachments(db, parsed.attachments);
  return parsed.conversation.id;
}
export function dispatchTransfer(
  db: Database.Database,
  directory: string | undefined,
  operation: StorageOperation,
) {
  if (operation.action === 'attachment.write')
    return writeAttachment(db, directory, operation);
  if (operation.action === 'attachment.read') {
    const parsed = attachmentReadSchema.parse(operation);
    return readAttachment(
      db,
      directory,
      parsed.id,
      parsed.offset,
      parsed.length,
    );
  }
  if (operation.action === 'attachment.meta')
    return attachmentMeta(db, operation.ids);
  if (operation.action === 'conversation.import')
    return importConversation(db, operation.file);
  if (operation.action === 'retention.apply')
    return applyRetention(db, operation.activeId);
  return undefined;
}
export function outboundMessages(
  db: Database.Database,
  directory: string | undefined,
  input: Parameters<typeof providerMessages>[2],
  vision: boolean,
) {
  return providerMessages(db, directory, input, vision);
}
