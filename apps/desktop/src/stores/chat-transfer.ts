import {
  ATTACHMENT_MAX_BYTES,
  attachmentMediaTypes,
  attachmentReadResultSchema,
  attachmentReferenceSchema,
  conversationFileSchema,
  retentionResultSchema,
  type AttachmentReference,
} from '@harness/contracts';
import type { Backend } from '../transport/backend';
import { conversationExport, exportDocument } from './conversation';
const allowed = new Set<string>(attachmentMediaTypes);
const chunkBytes = 192 * 1024;
function reject(code: string, message: string): never {
  throw Object.assign(new Error(message), { code, message });
}
export async function sha256Hex(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', copy);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}
export function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}
export function attachmentName(name: string) {
  const base = name.split(/[/\\]/).pop()?.replaceAll('\u0000', '') ?? '';
  return base.trim();
}
export async function storeAttachment(
  backend: Pick<Backend, 'storage'>,
  file: File,
) {
  const name = attachmentName(file.name);
  if (!allowed.has(file.type) || !name)
    reject(
      'INVALID_REQUEST',
      'Use a PNG, JPEG, WebP, GIF, text, Markdown, or PDF file.',
    );
  if (file.size <= 0 || file.size > ATTACHMENT_MAX_BYTES)
    reject('INVALID_REQUEST', 'Attachments must be between 1 byte and 10 MB.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const id = await sha256Hex(bytes);
  for (let offset = 0; offset < bytes.length; offset += chunkBytes) {
    await backend.storage({
      action: 'attachment.write',
      id,
      name,
      mediaType: file.type as AttachmentReference['mediaType'],
      size: bytes.length,
      offset,
      data: bytesToBase64(bytes.subarray(offset, offset + chunkBytes)),
    });
  }
  return attachmentReferenceSchema.parse({
    id,
    name,
    mediaType: file.type,
    size: bytes.length,
  });
}
export async function importConversationFile(
  backend: Pick<Backend, 'storage'>,
  file: File,
) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    reject('INVALID_REQUEST', 'Choose an Axioden conversation JSON file.');
  }
  const result = conversationFileSchema.safeParse(parsed);
  if (!result.success)
    reject(
      'INVALID_REQUEST',
      'This file is not an Axioden conversation export.',
    );
  const id = await backend.storage({
    action: 'conversation.import',
    file: result.data,
  });
  if (typeof id !== 'string' || !id)
    reject('STORAGE_ERROR', 'The conversation could not be imported.');
  return id;
}
export async function exportConversationFile(
  backend: Pick<Backend, 'storage'>,
  id: string,
) {
  const file = await conversationExport(backend, id);
  const contents = exportDocument(file);
  const blob = new Blob([contents], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${file.conversation.title.replace(/[^\w.-]+/g, '_') || 'conversation'}.axioden.json`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
export async function applyRetentionPolicy(
  backend: Pick<Backend, 'storage'>,
  activeId: string,
) {
  return retentionResultSchema.parse(
    await backend.storage({ action: 'retention.apply', activeId }),
  );
}
export async function readAttachmentText(
  backend: Pick<Backend, 'storage'>,
  id: string,
) {
  const parts: string[] = [];
  let offset = 0;
  for (let attempt = 0; attempt < 64; attempt += 1) {
    const chunk = attachmentReadResultSchema.parse(
      await backend.storage({
        action: 'attachment.read',
        id,
        offset,
        length: 196_608,
      }),
    );
    parts.push(chunk.data);
    if (chunk.complete) return parts.join('');
    offset += 196_608;
  }
  reject('STORAGE_ERROR', 'The attachment could not be read.');
}
