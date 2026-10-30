import { describe, it, expect, vi } from 'vitest';
import { parseModels, discoverModels } from './discovery';
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
      { id: 'visible', name: 'My model', available: true, verified: false },
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
});
