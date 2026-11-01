import { it, expect, vi } from 'vitest';
import { streamChat } from './inference';
import { readSse } from './sse';
import { providerError } from './errors';
const messages = [{ id: 'u', role: 'user' as const, text: 'Hello' }];
const sse = (events: unknown[]) =>
  new Response(
    events.map((event) => `data: ${JSON.stringify(event)}\r\n\r\n`).join(''),
    { headers: { 'content-type': 'text/event-stream' } },
  );
it('streams ChatGPT with full context, no storage, and no unsupported generation fields', async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
    sse([
      {
        type: 'response.created',
        response: { error: null, status: 'in_progress' },
      },
      {
        type: 'response.in_progress',
        response: { error: null, status: 'in_progress' },
      },
      { type: 'response.output_text.delta', delta: 'Hello' },
      { type: 'response.output_text.delta', delta: ' there' },
      {
        type: 'response.completed',
        response: { error: null, status: 'completed' },
      },
    ]),
  );
  const result = [];
  for await (const text of streamChat(
    'chatgpt',
    'fixture',
    messages,
    'fixture-token',
    new AbortController().signal,
    fetcher,
  ))
    result.push(text);
  expect(result).toEqual(['Hello', ' there']);
  const request = fetcher.mock.calls[0]?.[1];
  expect(JSON.parse(request?.body as string)).toEqual({
    model: 'fixture',
    input: [{ role: 'user', content: 'Hello' }],
    stream: true,
    store: false,
  });
});
it('requires explicit completion and sanitizes provider errors', async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      sse([{ type: 'response.output_text.delta', delta: 'partial' }]),
    );
  await expect(async () => {
    for await (const text of streamChat(
      'chatgpt',
      'fixture',
      messages,
      'fixture-token',
      new AbortController().signal,
      fetcher,
    ))
      expect(text).toBe('partial');
  }).rejects.toThrow();
  expect(
    JSON.stringify(providerError(new Error('Bearer secret-token'))),
  ).not.toContain('secret-token');
});
it('parses SSE split across UTF-8 and CRLF boundaries', async () => {
  const bytes = new TextEncoder().encode('data: {"text":"héllo"}\r\n\r\n');
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
      controller.close();
    },
  });
  const events = [];
  for await (const value of readSse(body, new AbortController().signal))
    events.push(value);
  expect(events).toEqual([{ text: 'héllo' }]);
});
it('maps subscription limits without exposing response bodies', async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
    sse([
      {
        type: 'response.failed',
        response: {
          error: {
            code: 'subscription_sharing_usage_limit_exceeded',
            message: 'private',
          },
        },
      },
    ]),
  );
  await expect(async () => {
    for await (const text of streamChat(
      'chatgpt',
      'fixture',
      messages,
      'fixture-token',
      new AbortController().signal,
      fetcher,
    )) {
      expect(text).toBeUndefined();
    }
  }).rejects.toMatchObject({ detail: { code: 'QUOTA' } });
});
