import { describe, expect, it } from 'vitest';
import { conversationFileSchema } from './conversation-file';
const legacy = {
  id: 'conversation-1',
  title: 'Legacy',
  pinned: false,
  updatedAt: 10,
  messages: [
    {
      id: 'message-1',
      role: 'assistant',
      text: 'Hello',
      status: 'completed',
      modelName: 'fixture',
      connectionId: 'openai',
    },
  ],
};
describe('conversation files', () => {
  it('imports versioned files and still reads conversations saved before the new fields', () => {
    const file = conversationFileSchema.parse({
      format: 'axioden-conversation',
      version: 1,
      conversation: legacy,
    });
    expect(file.conversation).toEqual(legacy);
    expect(file.attachments).toEqual([]);
  });
  it('rejects secrets, the wrong version, and attachments outside the limits', () => {
    expect(
      conversationFileSchema.safeParse({
        format: 'axioden-conversation',
        version: 1,
        conversation: legacy,
        apiKey: 'secret',
      }).success,
    ).toBe(false);
    expect(
      conversationFileSchema.safeParse({
        format: 'axioden-conversation',
        version: 2,
        conversation: legacy,
      }).success,
    ).toBe(false);
    expect(
      conversationFileSchema.safeParse({
        format: 'axioden-conversation',
        version: 1,
        conversation: { ...legacy, provider: 'removed-provider' },
      }).success,
    ).toBe(false);
    expect(
      conversationFileSchema.safeParse({
        format: 'axioden-conversation',
        version: 1,
        conversation: legacy,
        attachments: [
          {
            id: 'a'.repeat(64),
            name: '../secret.txt',
            mediaType: 'text/plain',
            size: 4,
          },
        ],
      }).success,
    ).toBe(false);
  });
});
