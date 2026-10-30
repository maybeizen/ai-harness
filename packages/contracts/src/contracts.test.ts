import { describe, it, expect } from 'vitest';
import { requestSchema, responseSchema, modes } from './index';
describe('wire contracts', () => {
  it('limits requests to infrastructure operations', () => {
    expect(
      requestSchema.safeParse({ version: 2, id: 'a', method: 'execute' })
        .success,
    ).toBe(false);
    expect(
      requestSchema.safeParse({ version: 99, id: 'a', method: 'hello' })
        .success,
    ).toBe(false);
    expect(
      requestSchema.safeParse({
        version: 2,
        id: 'a',
        method: 'health',
        apiKey: 'secret',
      }).success,
    ).toBe(false);
  });
  it('validates response payloads and reserves four modes', () => {
    expect(
      responseSchema.safeParse({
        version: 2,
        id: 'a',
        ok: true,
        result: { status: 'ready' },
      }).success,
    ).toBe(false);
    expect(modes).toEqual(['ask', 'plan', 'edit', 'agent']);
  });
});
