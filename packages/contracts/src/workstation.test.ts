import { describe, expect, it } from 'vitest';
import {
  CONTEXT_RECORD_MAX_CHARS,
  stripSecrets,
  workstationOperationSchema,
} from './workstation';
const record = {
  id: '00000000-0000-4000-8000-000000000001',
  kind: 'rule' as const,
  scope: 'global' as const,
  workspaceId: null,
  title: 'Style',
  body: 'Prefer small modules.',
  enabled: true,
};
describe('workstation contracts', () => {
  it('strips secret-bearing fields and keeps ordinary settings', () => {
    expect(
      stripSecrets({
        token: 'abc',
        nested: { apiKey: 'k', name: 'visible' },
        localCommand: 'secret-command-token',
        fontFamily: 'mono',
      }),
    ).toEqual({
      token: '[redacted]',
      nested: { apiKey: '[redacted]', name: 'visible' },
      localCommand: '[redacted]',
      fontFamily: 'mono',
    });
  });
  it('rejects audit, context, and retention requests that would overreach', () => {
    expect(
      workstationOperationSchema.safeParse({ action: 'audit', limit: 0 })
        .success,
    ).toBe(false);
    expect(
      workstationOperationSchema.safeParse({
        action: 'audit',
        limit: 10,
        extra: true,
      }).success,
    ).toBe(false);
    expect(
      workstationOperationSchema.safeParse({
        action: 'context.save',
        record: { ...record, body: 'x'.repeat(CONTEXT_RECORD_MAX_CHARS + 1) },
      }).success,
    ).toBe(false);
    expect(
      workstationOperationSchema.safeParse({
        action: 'context.save',
        record: { ...record, scope: 'workspace', workspaceId: null },
      }).success,
    ).toBe(false);
    expect(
      workstationOperationSchema.safeParse({
        action: 'retention.apply',
        confirmed: false,
        activeConversationId: null,
      }).success,
    ).toBe(false);
    expect(
      workstationOperationSchema.parse({
        action: 'retention.apply',
        confirmed: true,
        activeConversationId: 'active',
      }),
    ).toMatchObject({ confirmed: true });
    expect(
      workstationOperationSchema.safeParse({
        action: 'mcp.save',
        config: {
          id: '00000000-0000-4000-8000-000000000020',
          name: 'Local',
          enabled: true,
          transport: 'http',
          url: 'http://127.0.0.1:9/mcp',
          bearer: 'secret-token',
        },
      }).success,
    ).toBe(false);
    expect(
      workstationOperationSchema.safeParse({
        action: 'context.save',
        record: { ...record, kind: 'prompt' },
      }).success,
    ).toBe(true);
  });
});
