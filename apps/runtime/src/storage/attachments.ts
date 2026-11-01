import { createHash } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  rmSync,
  statSync,
  writeSync,
} from 'node:fs';
import { join, resolve, sep } from 'node:path';
import type Database from 'better-sqlite3';
import {
  attachmentReadResultSchema,
  attachmentReferenceSchema,
  type AttachmentReadResult,
  type AttachmentReference,
  type GenerationInput,
} from '@harness/contracts';
import { ProviderFailure } from '@harness/providers';
const images = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const text = new Set(['text/plain', 'text/markdown']);
function failure(code: string, message: string): never {
  throw new ProviderFailure({ code, message });
}
export function attachmentRoot(directory: string) {
  const root = resolve(directory, 'attachments');
  mkdirSync(join(root, 'partial'), { recursive: true, mode: 0o700 });
  chmodSync(root, 0o700);
  return root;
}
function contained(root: string, path: string) {
  const resolved = resolve(path);
  return resolved === root || resolved.startsWith(`${root}${sep}`);
}
function decode(data: string) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data) || data.length % 4 !== 0)
    failure('INVALID_REQUEST', 'Attachment data is not valid base64.');
  const bytes = Buffer.from(data, 'base64');
  if (bytes.toString('base64') !== data)
    failure('INVALID_REQUEST', 'Attachment data is not valid base64.');
  return bytes;
}
function hashFile(path: string) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}
interface AttachmentRow {
  id: string;
  name: string;
  media_type: AttachmentReference['mediaType'];
  size: number;
}
function reference(row: AttachmentRow): AttachmentReference {
  return attachmentReferenceSchema.parse({
    id: row.id,
    name: row.name,
    mediaType: row.media_type,
    size: row.size,
  });
}
function upsert(db: Database.Database, item: AttachmentReference) {
  db.prepare(
    `INSERT INTO attachments(id, name, media_type, size, created_at)
     VALUES(?,?,?,?,?)
     ON CONFLICT(id) DO NOTHING`,
  ).run(item.id, item.name, item.mediaType, item.size, Date.now());
}
export function writeAttachment(
  db: Database.Database,
  directory: string | undefined,
  input: {
    id: string;
    name: string;
    mediaType: AttachmentReference['mediaType'];
    size: number;
    offset: number;
    data: string;
  },
) {
  if (!directory)
    failure('STORAGE_ERROR', 'Attachment storage is not available.');
  const item = attachmentReferenceSchema.parse({
    id: input.id,
    name: input.name,
    mediaType: input.mediaType,
    size: input.size,
  });
  const bytes = decode(input.data);
  if (input.offset + bytes.length > item.size)
    failure('INVALID_REQUEST', 'Attachment upload exceeds its declared size.');
  const root = attachmentRoot(directory);
  const partial = join(root, 'partial', item.id);
  const finalPath = join(root, item.id);
  if (!contained(root, partial) || !contained(root, finalPath))
    failure('INVALID_REQUEST', 'Attachment path was rejected.');
  if (
    existsSync(finalPath) &&
    statSync(finalPath).size === item.size &&
    hashFile(finalPath) === item.id
  ) {
    upsert(db, item);
    return item;
  }
  if (input.offset === 0) rmSync(partial, { force: true });
  const current = existsSync(partial) ? statSync(partial).size : 0;
  if (current !== input.offset)
    failure(
      'INVALID_REQUEST',
      'Attachment upload restarted at the wrong offset.',
    );
  const fd = openSync(partial, current === 0 ? 'wx' : 'r+', 0o600);
  try {
    writeSync(fd, bytes, 0, bytes.length, input.offset);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  chmodSync(partial, 0o600);
  if (statSync(partial).size < item.size) return item;
  if (statSync(partial).size !== item.size || hashFile(partial) !== item.id) {
    rmSync(partial, { force: true });
    failure('INVALID_REQUEST', 'Attachment contents do not match its id.');
  }
  rmSync(finalPath, { force: true });
  const published = openSync(finalPath, 'wx', 0o600);
  try {
    const payload = readFileSync(partial);
    writeSync(published, payload);
    fsyncSync(published);
  } finally {
    closeSync(published);
  }
  chmodSync(finalPath, 0o600);
  rmSync(partial, { force: true });
  upsert(db, item);
  return item;
}
export function readAttachment(
  db: Database.Database,
  directory: string | undefined,
  id: string,
  offset: number,
  length: number,
): AttachmentReadResult {
  if (!directory)
    failure('STORAGE_ERROR', 'Attachment storage is not available.');
  const row = db
    .prepare('SELECT id, name, media_type, size FROM attachments WHERE id=?')
    .get(id) as AttachmentRow | undefined;
  if (!row)
    failure('NOT_FOUND', 'This attachment is not stored on this device.');
  const root = attachmentRoot(directory);
  const path = join(root, row.id);
  if (!contained(root, path) || !existsSync(path))
    failure('NOT_FOUND', 'This attachment is not stored on this device.');
  if (offset === 0 && hashFile(path) !== row.id)
    failure('STORAGE_ERROR', 'Stored attachment contents failed verification.');
  const size = statSync(path).size;
  const span = Math.min(
    262_144,
    Math.max(1, Number.isFinite(length) ? length : 196_608),
  );
  const fd = openSync(path, 'r');
  try {
    const bytes = Buffer.alloc(Math.min(span, Math.max(0, size - offset)));
    const read = bytes.length
      ? readSync(fd, bytes, 0, bytes.length, offset)
      : 0;
    return attachmentReadResultSchema.parse({
      reference: reference(row),
      offset,
      data: bytes.subarray(0, read).toString('base64'),
      complete: offset + read >= row.size,
    });
  } finally {
    closeSync(fd);
  }
}
export function attachmentMeta(db: Database.Database, ids: readonly string[]) {
  const rows = db
    .prepare(
      `SELECT id, name, media_type, size FROM attachments WHERE id IN (${ids.map(() => '?').join(',')})`,
    )
    .all(...ids) as AttachmentRow[];
  return rows.map(reference);
}
export function rememberAttachments(
  db: Database.Database,
  items: readonly AttachmentReference[],
) {
  for (const item of items) upsert(db, item);
}
function rowsFor(db: Database.Database, ids: readonly string[]) {
  if (!ids.length) return [];
  return db
    .prepare(
      `SELECT id, name, media_type, size FROM attachments WHERE id IN (${ids.map(() => '?').join(',')})`,
    )
    .all(...ids) as AttachmentRow[];
}
function excerpt(directory: string | undefined, id: string) {
  if (!directory) return '';
  const path = join(attachmentRoot(directory), id);
  if (!existsSync(path)) return '';
  return readFileSync(path).subarray(0, 16_384).toString('utf8');
}
export function providerMessages(
  db: Database.Database,
  directory: string | undefined,
  input: GenerationInput,
  vision: boolean,
): GenerationInput {
  return {
    ...input,
    messages: input.messages
      .filter((message) => message.id !== input.generationId)
      .map((message) => {
        const ids = message.attachmentIds ?? [];
        if (!ids.length) return message;
        const known = new Map(rowsFor(db, ids).map((row) => [row.id, row]));
        const kept: string[] = [];
        let body = message.text;
        for (const id of ids) {
          const row = known.get(id);
          if (!row) continue;
          if (images.has(row.media_type)) {
            if (vision) kept.push(id);
            continue;
          }
          kept.push(id);
          if (text.has(row.media_type)) {
            const sample = excerpt(directory, id);
            if (sample) body += `\n\nAttached ${row.name}:\n${sample}`;
          } else body += `\n\nAttached PDF: ${row.name}`;
        }
        const next = { ...message, text: body };
        if (kept.length) next.attachmentIds = kept;
        else delete next.attachmentIds;
        return next;
      }),
  };
}
