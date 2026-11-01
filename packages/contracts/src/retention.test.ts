import { describe, expect, it } from 'vitest';
import { retentionPolicySchema } from './retention';
import { settingsSchema } from './preferences';
describe('retention policy', () => {
  it('defaults to confirmation and always keeps the active conversation protected', () => {
    expect(retentionPolicySchema.parse({})).toEqual({
      enabled: false,
      maxAgeDays: null,
      maxConversations: null,
      confirmBeforeDelete: true,
      preserveActiveConversation: true,
    });
    const enabled = retentionPolicySchema.parse({ enabled: true });
    expect(enabled.confirmBeforeDelete).toBe(true);
    expect(enabled.preserveActiveConversation).toBe(true);
    expect(settingsSchema.parse({}).retention.preserveActiveConversation).toBe(
      true,
    );
  });
  it('rejects silent deletion and unknown fields', () => {
    for (const candidate of [
      { confirmBeforeDelete: false },
      { preserveActiveConversation: false },
      { maxAgeDays: 0 },
      { maxConversations: 0 },
      { enabled: true, deleteActive: true },
    ])
      expect(retentionPolicySchema.safeParse(candidate).success).toBe(false);
  });
});
