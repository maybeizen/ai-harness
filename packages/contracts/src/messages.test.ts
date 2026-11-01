import { describe, expect, it } from 'vitest';
import badStatus from '../fixtures/chat-message.bad-status.json';
import invalidMessage from '../fixtures/chat-message.invalid.json';
import legacyMessage from '../fixtures/chat-message.legacy.json';
import validMessage from '../fixtures/chat-message.json';
import {
  ATTACHMENT_MAX_BYTES,
  attachmentReferenceSchema,
  chatMessageSchema,
} from './messages';
import { savedMessageSchema } from './storage';
const attachment = {
  id: 'a'.repeat(64),
  name: 'notes.md',
  mediaType: 'text/markdown',
  size: 12,
} as const;
describe('chat messages and attachments', () => {
  it('accepts the shared fixture and legacy saved rows', () => {
    expect(chatMessageSchema.parse(validMessage)).toEqual(validMessage);
    expect(chatMessageSchema.parse(legacyMessage)).toEqual(legacyMessage);
    expect(savedMessageSchema.parse(legacyMessage)).toEqual(legacyMessage);
    expect(
      savedMessageSchema.safeParse({ id: 'm', role: 'user', text: 'Hi' })
        .success,
    ).toBe(false);
  });
  it('rejects invalid values, secrets, and unsafe attachment references', () => {
    expect(chatMessageSchema.safeParse(invalidMessage).success).toBe(false);
    expect(chatMessageSchema.safeParse(badStatus).success).toBe(false);
    expect(
      chatMessageSchema.safeParse({
        ...legacyMessage,
        reasoning: 'x'.repeat(65537),
      }).success,
    ).toBe(false);
    expect(
      chatMessageSchema.safeParse({
        ...legacyMessage,
        parentId: 'x'.repeat(129),
      }).success,
    ).toBe(false);
    expect(
      chatMessageSchema.safeParse({
        ...legacyMessage,
        attachmentIds: ['A'.repeat(64)],
      }).success,
    ).toBe(false);
    expect(
      chatMessageSchema.safeParse({
        ...legacyMessage,
        tools: Array.from({ length: 17 }, (_, index) => ({
          callId: `call-${index}`,
          name: 'read_file',
          status: 'completed',
        })),
      }).success,
    ).toBe(false);
    expect(attachmentReferenceSchema.parse(attachment)).toEqual(attachment);
    for (const candidate of [
      { ...attachment, id: 'a'.repeat(63) },
      { ...attachment, name: '../notes.md' },
      { ...attachment, name: 'dir/notes.md' },
      { ...attachment, mediaType: 'application/x-msdownload' },
      { ...attachment, size: 0 },
      { ...attachment, size: ATTACHMENT_MAX_BYTES + 1 },
      { ...attachment, credential: 'secret' },
    ])
      expect(attachmentReferenceSchema.safeParse(candidate).success).toBe(
        false,
      );
  });
});
