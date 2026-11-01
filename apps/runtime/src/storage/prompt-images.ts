import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import type Database from 'better-sqlite3';
import type { ChatMessage } from '@harness/contracts';
import { ProviderFailure, type PromptImage } from '@harness/providers';
const imageTypes = new Set<PromptImage['mediaType']>([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);
function failure(code: string, message: string): never {
  throw new ProviderFailure({ code, message });
}
function mediaType(value: string): PromptImage['mediaType'] | undefined {
  return imageTypes.has(value as PromptImage['mediaType'])
    ? (value as PromptImage['mediaType'])
    : undefined;
}
export function loadPromptImages(
  db: Database.Database,
  directory: string | undefined,
  messages: readonly Pick<ChatMessage, 'id' | 'role' | 'attachmentIds'>[],
) {
  const images: Record<string, PromptImage[]> = {};
  for (const message of messages) {
    if (message.role !== 'user') continue;
    const parts: PromptImage[] = [];
    for (const id of message.attachmentIds ?? []) {
      const row = db
        .prepare('SELECT media_type FROM attachments WHERE id=?')
        .get(id) as { media_type: string } | undefined;
      const type = row ? mediaType(row.media_type) : undefined;
      if (!type) continue;
      if (!directory)
        failure(
          'STORAGE_ERROR',
          'Image attachments are stored on this device and could not be read.',
        );
      const root = resolve(directory, 'attachments');
      const path = join(root, id);
      if (!path.startsWith(`${root}${sep}`) || !existsSync(path))
        failure(
          'NOT_FOUND',
          'This image attachment is not stored on this device.',
        );
      const bytes = readFileSync(path);
      if (createHash('sha256').update(bytes).digest('hex') !== id)
        failure(
          'STORAGE_ERROR',
          'Stored image attachment contents failed verification.',
        );
      parts.push({ mediaType: type, data: bytes.toString('base64') });
    }
    if (parts.length) images[message.id] = parts;
  }
  return images;
}
