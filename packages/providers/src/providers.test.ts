import { describe, it, expect, vi } from 'vitest';
import type { ProviderKind, ModelReference } from '@harness/contracts';
import { createModel } from './index';
const model: ModelReference = {
  providerId: 'personal',
  modelId: 'fixture-model',
  capabilities: {
    tools: 'unknown',
    images: 'unknown',
    structuredOutput: 'unknown',
  },
};
const credentials = { resolve: vi.fn().mockResolvedValue('fixture-key') };
describe('provider boundary', () => {
  it.each<ProviderKind>([
    'openai',
    'anthropic',
    'google',
    'xai',
    'openrouter',
    'ollama',
    'lmstudio',
    'custom',
  ])('constructs %s without networking', async (kind) => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const instance = await createModel(
      {
        id: 'personal',
        kind,
        baseURL: 'https://fixture.invalid/v1',
        credentialRef: 'fixture',
      },
      model,
      { credentials, fetch },
    );
    expect(instance.modelId).toBe('fixture-model');
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([true, false])(
    'forwards custom endpoint and optional authentication: %s',
    async (authenticated) => {
      const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: { role: 'assistant', content: 'fixture' },
                finish_reason: 'stop',
                index: 0,
              },
            ],
          }),
          { headers: { 'content-type': 'application/json' } },
        ),
      );
      const instance = await createModel(
        {
          id: 'personal',
          kind: 'custom',
          baseURL: 'http://127.0.0.1:1234/v1',
          ...(authenticated ? { credentialRef: 'fixture' } : {}),
        },
        model,
        { credentials, fetch },
      );
      await instance.doGenerate({
        prompt: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'offline fixture' }],
          },
        ],
      });
      const [url, options] = fetch.mock.calls[0]!;
      expect(
        url instanceof Request ? url.url : url instanceof URL ? url.href : url,
      ).toBe('http://127.0.0.1:1234/v1/chat/completions');
      expect(new Headers(options?.headers).get('authorization')).toBe(
        authenticated ? 'Bearer fixture-key' : null,
      );
    },
  );
  it('rejects mismatched references and missing credentials', async () => {
    await expect(
      createModel({ id: 'other', kind: 'ollama' }, model, { credentials }),
    ).rejects.toThrow('Invalid model');
    await expect(
      createModel({ id: 'personal', kind: 'openai' }, model, { credentials }),
    ).rejects.toThrow('credential');
  });
  it('supports independent configurations of the same provider', async () => {
    const first = await createModel({ id: 'personal', kind: 'ollama' }, model, {
      credentials,
    });
    const second = await createModel(
      { id: 'second', kind: 'ollama', baseURL: 'http://localhost:9999/v1' },
      { ...model, providerId: 'second' },
      { credentials },
    );
    expect(first.provider).not.toBe(second.provider);
  });
  it('rejects credential-bearing endpoints before resolving a key', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const resolve = vi.fn().mockResolvedValue('fixture-key');
    await expect(
      createModel(
        {
          id: 'personal',
          kind: 'custom',
          baseURL: 'http://user:secret-token@127.0.0.1:9/v1',
          credentialRef: 'fixture',
        },
        model,
        { credentials: { resolve }, fetch },
      ),
    ).rejects.toThrow('Invalid provider endpoint');
    await expect(
      createModel(
        {
          id: 'personal',
          kind: 'ollama',
          baseURL: 'http://127.0.0.1:11434/v1?api_key=secret-token',
        },
        model,
        { credentials: { resolve }, fetch },
      ),
    ).rejects.toThrow('Invalid provider endpoint');
    expect(resolve).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(String(resolve.mock.calls)).not.toContain('secret-token');
  });
});
