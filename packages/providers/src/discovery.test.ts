import { describe, it, expect, vi } from 'vitest';
import { generationControlFlags } from '@harness/contracts';
import { parseModels, discoverModels } from './discovery';
const unknownCapabilities = {
  tools: 'unknown',
  images: 'unknown',
  structuredOutput: 'unknown',
  reasoningEffort: 'unknown',
  temperature: 'unknown',
  maxOutputTokens: 'unknown',
  vision: 'unknown',
} as const;
function calledUrl(input: Parameters<typeof fetch>[0] | undefined) {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  if (input instanceof Request) return input.url;
  return '';
}
describe('authenticated model discovery', () => {
  it('uses the ChatGPT account catalog, not an API static list', () => {
    expect(
      parseModels('chatgpt', {
        models: [
          { slug: 'visible', display_name: 'My model', visibility: 'list' },
          { slug: 'hidden', visibility: 'hide' },
        ],
      }),
    ).toEqual([
      {
        id: 'visible',
        name: 'My model',
        available: true,
        verified: false,
        capabilities: unknownCapabilities,
      },
    ]);
  });
  it('filters non-chat and retired OpenAI models and unsupported Gemini methods', () => {
    expect(
      parseModels('openai', {
        data: [
          { id: 'gpt-fixture' },
          { id: 'text-embedding-fixture' },
          { id: 'gpt-audio-fixture' },
          { id: 'gpt-retired', shutdown_date: '2020-01-01' },
        ],
      }).map((model) => model.id),
    ).toEqual(['gpt-fixture']);
    expect(
      parseModels('google', {
        models: [
          {
            name: 'models/gemini-fixture',
            displayName: 'Gemini fixture',
            supportedGenerationMethods: ['generateContent'],
          },
          {
            name: 'models/embedding',
            supportedGenerationMethods: ['embedContent'],
          },
        ],
      }).map((model) => model.id),
    ).toEqual(['gemini-fixture']);
  });
  it('paginates with credentials in headers and deduplicates models', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          data: [{ id: 'claude-a' }],
          has_more: true,
          last_id: 'claude-a',
        }),
      )
      .mockResolvedValueOnce(
        Response.json({ data: [{ id: 'claude-b' }], has_more: false }),
      );
    const models = await discoverModels(
      'anthropic',
      'fixture-key',
      new AbortController().signal,
      fetcher,
    );
    expect(models.map((model) => model.id)).toEqual(['claude-a', 'claude-b']);
    const called = fetcher.mock.calls[1]?.[0];
    expect(
      new URL(
        called instanceof Request
          ? called.url
          : called instanceof URL
            ? called.href
            : (called ?? ''),
      ).searchParams.get('after_id'),
    ).toBe('claude-a');
    expect(
      new Headers(fetcher.mock.calls[0]?.[1]?.headers).get('x-api-key'),
    ).toBe('fixture-key');
  });
  it('never returns a fallback catalog after authentication failure', async () => {
    await expect(
      discoverModels(
        'openai',
        'invalid',
        new AbortController().signal,
        vi
          .fn<typeof fetch>()
          .mockResolvedValue(new Response('', { status: 401 })),
      ),
    ).rejects.toMatchObject({ detail: { code: 'AUTH_REQUIRED' } });
  });
  it('fills documented families and keeps unknown models unverified', () => {
    const gpt = parseModels('openai', { data: [{ id: 'gpt-4o' }] })[0];
    expect(gpt?.verified).toBe(false);
    expect(gpt?.capabilities).toMatchObject({
      tools: 'supported',
      vision: 'supported',
      temperature: 'supported',
      reasoningEffort: 'unsupported',
      maxOutputTokens: 'supported',
    });
    expect(generationControlFlags(gpt?.capabilities)).toMatchObject({
      reasoningEffort: false,
      temperature: true,
      vision: true,
    });
    expect(
      parseModels('openai', { data: [{ id: 'gpt-fixture' }] })[0]?.capabilities,
    ).toEqual(unknownCapabilities);
    expect(generationControlFlags(unknownCapabilities)).toEqual({
      reasoningEffort: false,
      temperature: false,
      maxOutputTokens: false,
      vision: false,
    });
    expect(
      parseModels('openai', { data: [{ id: 'o1-mini' }] })[0]?.capabilities
        ?.tools,
    ).toBe('unsupported');
    const gemini = parseModels('google', {
      models: [
        {
          name: 'models/gemini-2.5-pro',
          supportedGenerationMethods: ['generateContent'],
          outputTokenLimit: 8192,
          maxTemperature: 2,
        },
      ],
    })[0];
    expect(gemini?.capabilities).toMatchObject({
      tools: 'supported',
      vision: 'supported',
      temperature: 'supported',
      maxOutputTokens: 'supported',
      reasoningEffort: 'unknown',
    });
    expect(
      parseModels('xai', {
        data: [
          {
            id: 'grok-4',
            output_modalities: ['text'],
            input_modalities: ['text'],
          },
        ],
      })[0]?.capabilities?.vision,
    ).toBe('unsupported');
    expect(
      parseModels('openrouter', {
        data: [
          {
            id: 'openai/gpt-4o',
            supported_parameters: ['temperature'],
            architecture: { input_modalities: ['text', 'image'] },
          },
        ],
      })[0]?.capabilities,
    ).toMatchObject({
      tools: 'unsupported',
      temperature: 'supported',
      vision: 'supported',
      reasoningEffort: 'unsupported',
    });
    expect(
      parseModels('ollama', {
        data: [{ id: 'llama', capabilities: ['completion'] }],
      })[0]?.capabilities,
    ).toMatchObject({ tools: 'unsupported', vision: 'unsupported' });
  });
  it('discovers compatible catalogs offline and rejects credential URLs before fetch', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(() =>
        Promise.resolve(Response.json({ data: [{ id: 'local-model' }] })),
      );
    const signal = new AbortController().signal;
    const ollama = await discoverModels('ollama', '', signal, fetcher);
    expect(ollama[0]?.capabilities).toEqual(unknownCapabilities);
    expect(calledUrl(fetcher.mock.calls[0]?.[0])).toBe(
      'http://127.0.0.1:11434/v1/models',
    );
    expect(
      new Headers(fetcher.mock.calls[0]?.[1]?.headers).get('authorization'),
    ).toBeNull();
    fetcher.mockClear();
    await discoverModels(
      'lmstudio',
      'local-token',
      signal,
      fetcher,
      'http://127.0.0.1:1234/v1/',
    );
    expect(calledUrl(fetcher.mock.calls[0]?.[0])).toBe(
      'http://127.0.0.1:1234/v1/models',
    );
    expect(
      new Headers(fetcher.mock.calls[0]?.[1]?.headers).get('authorization'),
    ).toBe('Bearer local-token');
    fetcher.mockClear();
    await discoverModels('openrouter', 'router-key', signal, fetcher);
    expect(calledUrl(fetcher.mock.calls[0]?.[0])).toBe(
      'https://openrouter.ai/api/v1/models',
    );
    const rejected = discoverModels(
      'custom',
      'token',
      signal,
      fetcher,
      'http://user:secret-token@127.0.0.1:9/v1',
    );
    await expect(rejected).rejects.toMatchObject({
      detail: { code: 'INVALID_REQUEST' },
    });
    await expect(rejected).rejects.toThrow(
      /without credentials|Remove credentials/,
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    await expect(
      discoverModels(
        'custom',
        '',
        signal,
        fetcher,
        'http://127.0.0.1:9/v1?api_key=secret-token',
      ),
    ).rejects.toThrow(/credentials/);
    await expect(
      discoverModels('openai', 'key', signal, fetcher, 'https://evil.invalid'),
    ).rejects.toMatchObject({ detail: { code: 'INVALID_REQUEST' } });
    expect(JSON.stringify(fetcher.mock.calls)).not.toContain('secret-token');
  });
});
